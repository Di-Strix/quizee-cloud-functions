import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';

import { callWithChecks, checkAppCheck } from './functionPreprocessor';
import { checkAnswersCheckList, checkAnswersImplementation } from './functions-implementation/checkAnswers';
import { getQuizeeListCheckList, getQuizeeListImplementation } from './functions-implementation/getQuizeeList';

admin.initializeApp();

export const getQuizeeList = functions.https.onCall(
  callWithChecks(getQuizeeListImplementation, [checkAppCheck, ...getQuizeeListCheckList])
);

export const checkAnswers = functions.https.onCall(
  callWithChecks(checkAnswersImplementation, [checkAppCheck, ...checkAnswersCheckList])
);
