import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';

import { callWithChecks, checkAppCheck } from './functionPreprocessor';
import { checkAnswersCheckList, checkAnswersImplementation } from './functions-implementation/checkAnswers';
import { getQuizeeListCheckList, getQuizeeListImplementation } from './functions-implementation/getQuizeeList';
import { onUserCreatedImplementation } from './functions-implementation/onUserCreated';
import { onUserDeletedImplementation } from './functions-implementation/onUserDeleted';

admin.initializeApp();

export const getQuizeeList = functions.https.onCall(
  callWithChecks(getQuizeeListImplementation, [checkAppCheck, ...getQuizeeListCheckList])
);

export const checkAnswers = functions.https.onCall(
  callWithChecks(checkAnswersImplementation, [checkAppCheck, ...checkAnswersCheckList])
);

export const onUserCreated = functions.auth.user().onCreate(onUserCreatedImplementation);
export const onUserDeleted = functions.auth.user().onDelete(onUserDeletedImplementation)