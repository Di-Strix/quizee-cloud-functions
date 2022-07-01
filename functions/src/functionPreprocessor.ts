import { https } from 'firebase-functions';

export type CheckerFunction = (
  data: unknown,
  context: https.CallableContext
) => {
  passed: boolean;
  code?: https.FunctionsErrorCode;
  message?: string;
};

export type CloudFunction<Fn> = Fn extends (data: infer D, context: https.CallableContext) => infer R
  ? (data: D, context: https.CallableContext) => R
  : unknown;

export type CheckList = Array<CheckerFunction>;

export const callWithChecks = <
  DataType,
  ReturnType,
  Fn extends (data: DataType, context: https.CallableContext) => ReturnType
>(
  fn: Fn,
  checkList: CheckList = []
) => {
  return (data: DataType, context: https.CallableContext) => {
    checkList.forEach((checker) => {
      const result = checker(data, context);
      if (!result.passed) {
        throw new https.HttpsError(result.code || 'internal', result.message || '');
      }
    });

    return fn(data, context);
  };
};

export const checkAppCheck: CheckerFunction = (_, context) => {
  return {
    passed: !!context.app,
    code: 'failed-precondition',
    message: 'The function must be called from an App Check verified app.',
  };
};
