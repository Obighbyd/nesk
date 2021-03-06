import 'reflect-metadata';
import { Controller } from '@neskjs/common/interfaces/controllers/controller.interface';
import { RequestMethod } from '@neskjs/common/enums/request-method.enum';
import { RouterProxy, RouterProxyCallback } from './router-proxy';
import { UnknownRequestMappingException } from '../errors/exceptions/unknown-request-mapping.exception';
import { KoaAdapter } from '../adapters/koa-adapter';
import { Metatype } from '@neskjs/common/interfaces/metatype.interface';
import { isUndefined, validatePath } from '@neskjs/common/utils/shared.utils';
import { RouterMethodFactory } from '../helpers/router-method-factory';
import { PATH_METADATA, METHOD_METADATA } from '@neskjs/common/constants';
import { Logger } from '@neskjs/common/services/logger.service';
import { RouteMappedMessage } from '../helpers/messages';
import { RouterExecutionContext } from './router-execution-context';
import { ExceptionsFilter } from './interfaces/exceptions-filter.interface';
import { RouteParamsFactory } from './route-params-factory';
import { RouterExplorer } from './interfaces/explorer.inteface';
import { MetadataScanner } from '../metadata-scanner';
import { ApplicationConfig } from './../application-config';
import { PipesContextCreator } from './../pipes/pipes-context-creator';
import { PipesConsumer } from './../pipes/pipes-consumer';
import { NeskContainer } from '../injector/container';
import { GuardsContextCreator } from '../guards/guards-context-creator';
import { GuardsConsumer } from '../guards/guards-consumer';
import { InterceptorsContextCreator } from '../interceptors/interceptors-context-creator';
import { InterceptorsConsumer } from '../interceptors/interceptors-consumer';

export class KoaRouterExplorer implements RouterExplorer {
  private readonly executionContextCreator: RouterExecutionContext;
  private readonly routerMethodFactory = new RouterMethodFactory();
  private readonly logger = new Logger('RouterExplorer', true);

  constructor(
    private readonly metadataScanner?: MetadataScanner,
    private readonly routerProxy?: RouterProxy,
    private readonly koaAdapter?: KoaAdapter,
    private readonly exceptionsFilter?: ExceptionsFilter,
    private readonly config?: ApplicationConfig,
    container?: NeskContainer,
  ) {
    this.executionContextCreator = new RouterExecutionContext(
      new RouteParamsFactory(),
      new PipesContextCreator(config),
      new PipesConsumer(),
      new GuardsContextCreator(container, config),
      new GuardsConsumer(),
      new InterceptorsContextCreator(container, config),
      new InterceptorsConsumer(),
    );
  }

  public explore(
    instance: Controller,
    metatype: Metatype<Controller>,
    module: string,
  ) {
    const router = (this.koaAdapter as any).createRouter();
    const routerPaths = this.scanForPaths(instance);

    this.applyPathsToRouterProxy(router, routerPaths, instance, module);
    return router;
  }

  public fetchRouterPath(
    metatype: Metatype<Controller>,
    prefix?: string,
  ): string {
    let path = Reflect.getMetadata(PATH_METADATA, metatype);
    if (path === '') return path;
    if (prefix) path = prefix + this.validateRoutePath(path);
    return this.validateRoutePath(path);
  }

  public validateRoutePath(path: string): string {
    if (isUndefined(path)) {
      throw new UnknownRequestMappingException();
    }
    return validatePath(path);
  }

  // ????????????controller??????route??????
  public scanForPaths(instance: Controller, prototype?): RoutePathProperties[] {
    const instancePrototype = isUndefined(prototype)
      ? Object.getPrototypeOf(instance)
      : prototype;
    return this.metadataScanner.scanFromPrototype<
      Controller,
      RoutePathProperties
    >(instance, instancePrototype, method =>
      this.exploreMethodMetadata(instance, instancePrototype, method),
    );
  }

  public exploreMethodMetadata(
    instance: Controller,
    instancePrototype,
    methodName: string,
  ): RoutePathProperties {
    const targetCallback = instancePrototype[methodName];
    const routePath = Reflect.getMetadata(PATH_METADATA, targetCallback);
    if (isUndefined(routePath)) {
      return null;
    }

    const requestMethod: RequestMethod = Reflect.getMetadata(
      METHOD_METADATA,
      targetCallback,
    );
    return {
      path: this.validateRoutePath(routePath),
      requestMethod,
      targetCallback,
      methodName,
    };
  }

  public applyPathsToRouterProxy(
    router,
    routePaths: RoutePathProperties[],
    instance: Controller,
    module: string,
  ) {
    (routePaths || []).map(pathProperties => {
      const { path, requestMethod } = pathProperties;
      this.applyCallbackToRouter(router, pathProperties, instance, module);
      this.logger.log(RouteMappedMessage(path, requestMethod));
    });
  }

  private applyCallbackToRouter(
    router,
    pathProperties: RoutePathProperties,
    instance: Controller,
    module: string,
  ) {
    const { path, requestMethod, targetCallback, methodName } = pathProperties;

    const routerMethod = this.routerMethodFactory
      .get(router, requestMethod)
      .bind(router);
    const proxy = this.createCallbackProxy(
      instance,
      targetCallback,
      methodName,
      module,
      requestMethod,
    );
    routerMethod(path, proxy);
  }

  private createCallbackProxy(
    instance: Controller,
    callback: RouterProxyCallback,
    methodName: string,
    module: string,
    requestMethod,
  ) {
    const executionContext = this.executionContextCreator.create(
      instance,
      callback,
      methodName,
      module,
      requestMethod,
    );
    const exceptionFilter = this.exceptionsFilter.create(instance, callback);
    return this.routerProxy.createProxy(executionContext, exceptionFilter);
  }
}

export interface RoutePathProperties {
  path: string;
  requestMethod: RequestMethod;
  targetCallback: RouterProxyCallback;
  methodName: string;
}
