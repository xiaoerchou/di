import { Provider } from './provider';
import { InjectFlags, Injector } from './injector';
import { NormalizedProvider, normalizeProviders, ReflectiveDependency } from './reflective-provider';
import { Self, SkipSelf } from './metadata';
import { makeInjectError } from './utils/inject-error';
import { ForwardRef } from './forward-ref';
import { Type } from './type';
import { InjectionToken } from './injection-token';
import { THROW_IF_NOT_FOUND } from './null-injector';

const reflectiveInjectorErrorFn = makeInjectError('ReflectiveInjectorError');

export class ReflectiveInjector extends Injector {
  private readonly normalizedProviders: NormalizedProvider[];
  private readonly reflectiveValues = new Map<any, any>();


  constructor(public parentInjector: Injector, private staticProviders: Provider[]) {
    super()
    this.normalizedProviders = normalizeProviders(staticProviders);
  }

  get<T>(token: Type<T> | InjectionToken<T>, notFoundValue: T = THROW_IF_NOT_FOUND as T, flags?: InjectFlags): T {
    flags = flags || InjectFlags.Default;
    if (flags === InjectFlags.SkipSelf) {
      if (this.parentInjector) {
        return this.parentInjector.get(token, notFoundValue);
      }
      throw reflectiveInjectorErrorFn(token);
    }
    if (this.reflectiveValues.has(token)) {
      return this.reflectiveValues.get(token);
    }
    let reflectiveValue = notFoundValue;
    for (let i = 0; i < this.normalizedProviders.length; i++) {
      const {provide, deps, factory} = this.normalizedProviders[i];
      if (provide === token) {
        const ff = factory(this, (token: Type<any>, value: any) => {
          this.reflectiveValues.set(token, value)
        });
        const params = this.resolveDeps(deps || [], notFoundValue);
        reflectiveValue = ff(...params);
        this.reflectiveValues.set(token, reflectiveValue);
        break;
      }
    }

    if (reflectiveValue === notFoundValue) {
      if (flags === InjectFlags.Self && reflectiveValue === THROW_IF_NOT_FOUND) {
        throw reflectiveInjectorErrorFn(token);
      }
      if (this.parentInjector) {
        return this.parentInjector.get(token, notFoundValue, flags);
      }
      throw reflectiveInjectorErrorFn(token);
    }
    if (reflectiveValue === null || typeof reflectiveValue === 'undefined') {
      throw reflectiveInjectorErrorFn(token);
    }
    return reflectiveValue;
  }

  private resolveDeps(deps: ReflectiveDependency[], notFoundValue): any[] {
    return deps.map(dep => {
      let reflectiveValue;
      const injectToken = dep.injectKey instanceof ForwardRef ? dep.injectKey.getRef() : dep.injectKey;
      if (dep.visibility instanceof Self) {
        reflectiveValue = this.get(injectToken, notFoundValue, InjectFlags.Self);
      } else if (dep.visibility instanceof SkipSelf) {
        if (this.parentInjector) {
          reflectiveValue = this.parentInjector.get(injectToken, notFoundValue, InjectFlags.Default);
        } else {
          throw reflectiveInjectorErrorFn(injectToken);
        }
      } else {
        reflectiveValue = this.get(injectToken) || this.parentInjector?.get(injectToken);
      }
      if (reflectiveValue === THROW_IF_NOT_FOUND) {
        if (dep.optional) {
          return notFoundValue;
        }
        throw reflectiveInjectorErrorFn(injectToken);
      }
      return reflectiveValue;
    })
  }
}
