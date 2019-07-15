import { config } from './config';
import uuid from 'uuid/v4';
import { getUserId } from '../modules/prisma/utils';
import { prisma } from '../../generated/prisma-client';
import express from 'express';
import session from 'express-session';
import { CORS_WHITELIST } from './const';
const MemcachedStore = require('connect-memcached')(session);

export const isProduction = config.environment === 'production';

export function getServerSessionConfig(store) {
  return {
    secret: 'csti',
    rolling: true,
    key: 'csti',
    genid: () => uuid(),
    resave: true,
    saveUninitialized: false,
    cookie: {
      secure: isProduction,
    },
    store,
  };
}

export function getResponseCacheConfig() {
  return {
    sessionId: (requestContext) => {
      return requestContext.context.sessionID || null;
    },
    shouldReadFromCache: (requestContext) => {
      const { request } = requestContext;
      const { operationName } = request;

      if (operationName === 'IntrospectionQuery') {
        return false;
      }

      return true;
    },
  };
}

interface ExpressContextWithSession extends express.Request {
  session?: any;
}

export async function getApolloResolverContext(request) {
  const req: ExpressContextWithSession = request.req;
  return {
    user: await getUserId(request),
    prisma,
    session: req.session,
    sessionID: req.session.id,
  };
}

export function getEngineConfig() {
  return {
    apiKey: process.env.ENGINE_API_KEY,
    generateClientInfo: ({ request }) => {
      const headers = request.http && request.http.headers;
      if (headers) {
        return {
          clientName: headers.get('apollo-client-name'),
          clientVersion: headers.get('apollo-client-version'),
        };
      } else {
        return {
          clientName: 'Unknown Client',
          clientVersion: 'Unversioned',
        };
      }
    },
  };
}

export function getCacheControlConfig() {
  return {
    defaultMaxAge: 3600000,
    calculateHttpHeaders: true,
  };
}

export function getErrorFormatter(err) {
  // console.log('[ERROR:]', JSON.stringify(error));
  return err;
}

export function getDistributedStore() {
  return new MemcachedStore({
    hosts: [
      `${
        isProduction
          ? 'memcached-1-memcached-svc.default.svc.cluster.local:11211'
          : '0.0.0.0:11211'
      }`,
    ],
    retries: 10,
    retry: 1000,
  });
}

export function getPersistedQueriesConfig() {
  return {
    cache: getDistributedStore(),
  };
}

export function getOrigin(origin, callback) {
  if (CORS_WHITELIST.indexOf(origin) !== -1) {
    callback(null, true);
  } else {
    callback(new Error('Not allowed by CORS'));
  }
}

export function getApolloMiddlewareConfig() {
  return {
    path: '/',
    cors: {
      origin: getOrigin,
      credentials: true,
    },
    bodyParserConfig: {
      limit: '10mb',
    },
  };
}

export function getServerStartCallback(config, graphqlServer) {
  console.log(
    `🚀 Server ready at`,
    `http${config.ssl ? 's' : ''}://${config.hostname}:${config.port}${
      graphqlServer.graphqlPath
    }`,
  );
}
