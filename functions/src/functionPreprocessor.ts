import { https } from 'firebase-functions';

export type CheckerFunction = (
  data: unknown,
  context: https.CallableContext
) => {
  passed: boolean;
  code?: https.FunctionsErrorCode;
  message?: string;
};

export type CloudFunction<Fn> = Fn extends (data: infer D, context: https.CallableContext) => Promise<infer R>
  ? (data: D, context: https.CallableContext) => Promise<R>
  : unknown;

export type CheckList = Array<CheckerFunction>;

export const callWithChecks = <
  DataType,
  ReturnType,
  Fn extends (data: DataType, context: https.CallableContext) => Promise<ReturnType>
>(
  fn: Fn,
  checkList: CheckList = []
) => {
  return async (data: DataType, context: https.CallableContext) => {
    checkList.forEach((checker) => {
      const result = checker(data, context);
      if (!result.passed) {
        throw new https.HttpsError(result.code || 'internal', result.message || '');
      }
    });

    return await fn(data, context);
  };
};

export const checkAppCheck: CheckerFunction = (_, context) => {
  return {
    passed: !!context.app,
    code: 'failed-precondition',
    message: 'The function must be called from an App Check verified app.',
  };
};
