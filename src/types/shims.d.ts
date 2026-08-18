/**
 * Local type shims for packages that don't ship with their own declarations
 * and for which @types/* packages haven't been installed yet.
 *
 * These intentionally provide only the minimum surface we actually use, not
 * a full type re-implementation. Installing the matching @types/* package
 * later simply overrides these shims with no code changes required.
 */

declare module 'swagger-jsdoc' {
  interface Options {
    definition?: object;
    apis?: string[];
  }
  function swaggerJsdoc(options: Options): object;
  export default swaggerJsdoc;
}

declare module 'swagger-ui-express' {
  import type { RequestHandler, Request, Response, NextFunction } from 'express';

  const serve: RequestHandler[];
  function setup(
    swaggerDocument: object,
    options?: object,
    customCss?: string,
    customfavIcon?: string,
    swaggerUrl?: string,
    custSiteTitle?: string,
    swaggerUrlConfig?: object,
  ): (req: Request, res: Response, next: NextFunction) => void;
}
