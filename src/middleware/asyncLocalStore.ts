import { AsyncLocalStorage } from "async_hooks";

export interface RequestContext {
  correlationId: string;
  requestStarted: number;
}

export const asyncLocalStore = new AsyncLocalStorage<RequestContext>();

export const getContext = (): RequestContext | undefined => {
  return asyncLocalStore.getStore();
};

export const getCorrelationId = (): string => {
  return asyncLocalStore.getStore()?.correlationId ?? "no-correlation-id";
};
