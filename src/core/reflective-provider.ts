import {
  ClassProvider,
  ConstructorProvider,
  ExistingProvider,
  FactoryProvider,
  Provider, TypeProvider,
  ValueProvider
} from './provider';
import { Injector } from './injector';
import { Inject, Optional, Self, SkipSelf } from './metadata';
import { Type } from './type';
import { getAnnotations } from './decorators';
import { stringify } from './utils/stringify';

export interface ReflectiveDependency {
  injectKey: any;
  visibility: SkipSelf | Self;
  optional: boolean;
}

export interface NormalizedProvider {
  provide: any,
  generateFactory: (injector: Injector, cacheFn: (token: any, value: any) => void) => (...args: any[]) => any;
  deps: ReflectiveDependency[]
}

export function normalizeProviders(providers: Provider[]): NormalizedProvider[] {
  return providers.map(provider => {
    if ((provider as ValueProvider).useValue) {
      return normalizeValueProviderFactory(provider as ValueProvider);
    } else if ((provider as ClassProvider).useClass) {
      return normalizeClassProviderFactory(provider as ClassProvider);
    } else if ((provider as ExistingProvider).useExisting) {
      return normalizeExistingProviderFactory(provider as ExistingProvider);
    } else if ((provider as FactoryProvider).useFactory) {
      return normalizeFactoryProviderFactory(provider as FactoryProvider);
    } else if ((provider as ConstructorProvider).provide) {
      return normalizeConstructorProviderFactory(provider as ConstructorProvider);
    } else {
      return normalizeTypeProviderFactory(provider as TypeProvider);
    }
  })
}

function normalizeValueProviderFactory(provider: ValueProvider): NormalizedProvider {
  return {
    provide: provider.provide,
    generateFactory() {
      return function () {
        return provider.useValue
      }
    },
    deps: []
  }
}

function normalizeClassProviderFactory(provider: ClassProvider): NormalizedProvider {
  let deps: ReflectiveDependency[]
  if (provider.deps) {
    deps = normalizeDeps(provider.deps);
  } else {
    deps = normalizeDeps(resolveClassParams(provider.useClass));
  }
  return {
    provide: provider.provide,
    deps,
    generateFactory(injector, cacheFn) {
      return function (...args: any[]) {
        const instance = new provider.useClass(...args);
        const propMetadataKeys = getAnnotations(provider.useClass).getPropMetadataKeys();
        propMetadataKeys.forEach(key => {
          const propsMetadata = getAnnotations(provider.useClass).getPropMetadata(key) || [];
          propsMetadata.forEach(item => {
            item.contextCallback(instance, item.propertyKey, injector);
          })
        })
        cacheFn(provider.useClass, instance);
        return instance;
      }
    }
  }
}

function normalizeExistingProviderFactory(provider: ExistingProvider): NormalizedProvider {
  return {
    provide: provider.provide,
    generateFactory(injector: Injector) {
      return function () {
        return injector.get(provider.useExisting)
      }
    },
    deps: []
  }
}

function normalizeFactoryProviderFactory(provider: FactoryProvider): NormalizedProvider {
  return {
    provide: provider.provide,
    generateFactory() {
      return function (...args: any[]) {
        return provider.useFactory(...args);
      }
    },
    deps: normalizeDeps(provider.deps || [])
  }
}

function normalizeConstructorProviderFactory(provider: ConstructorProvider): NormalizedProvider {
  return normalizeClassProviderFactory({
    ...provider,
    useClass: provider.provide
  })
}

function normalizeTypeProviderFactory(provider: TypeProvider): NormalizedProvider {
  return normalizeClassProviderFactory({
    provide: provider,
    useClass: provider
  })
}

function resolveClassParams(construct: Type<any>) {
  const annotations = getAnnotations(construct);
  const classMetadataKeys = annotations.getClassMetadataKeys();
  if (classMetadataKeys.length === 0) {
    throw new Error(`class \`${stringify(construct)}\` not find ClassDecorator!`);
  }
  return classMetadataKeys.reduce((deps: [], key) => {
    const annotation = annotations.getClassMetadata(key);
    return annotation.contextCallback(annotation.params, annotations, construct) || deps;
  }, [])
}

function normalizeDeps(deps: any[]): ReflectiveDependency[] {
  return deps.map(dep => {
    const r: ReflectiveDependency = {
      injectKey: null,
      optional: false,
      visibility: null
    }
    if (!Array.isArray(dep)) {
      r.injectKey = dep
    } else {
      for (let i = 0; i < dep.length; i++) {
        const item = dep[i];
        if (item instanceof Inject) {
          r.injectKey = item.token
        } else if (item instanceof Self || item instanceof SkipSelf) {
          r.visibility = item
        } else if (item instanceof Optional) {
          r.optional = true
        } else {
          r.injectKey = item;
        }
      }
    }
    return r;
  })
}
