import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';

import { callWithChecks, checkAppCheck } from './functionPreprocessor';
import { checkAnswersCheckList, checkAnswersImplementation } from './functions-implementation/checkAnswers';
import { getFullQuizeeCheckList, getFullQuizeeImplementation } from './functions-implementation/getFullQuizee';
import { getPublicQuizeeCheckList, getPublicQuizeeImplementation } from './functions-implementation/getPublicQuizee';
import { getQuizeeListCheckList, getQuizeeListImplementation } from './functions-implementation/getQuizeeList';
import { onUserCreatedImplementation } from './functions-implementation/onUserCreated';
import { onUserDeletedImplementation } from './functions-implementation/onUserDeleted';
import { publishQuizeeCheckList, publishQuizeeImplementation } from './functions-implementation/publishQuizee';

admin.initializeApp();

export const getQuizeeList = functions.https.onCall(
  callWithChecks(getQuizeeListImplementation, [checkAppCheck, ...getQuizeeListCheckList])
);

export const checkAnswers = functions.https.onCall(
  callWithChecks(checkAnswersImplementation, [checkAppCheck, ...checkAnswersCheckList])
);

export const publishQuizee = functions.https.onCall(
  callWithChecks(publishQuizeeImplementation, [checkAppCheck, ...publishQuizeeCheckList])
);

export const getFullQuizee = functions.https.onCall(
  callWithChecks(getFullQuizeeImplementation, [checkAppCheck, ...getFullQuizeeCheckList])
);

export const getPublicQuizee = functions.https.onCall(
  callWithChecks(getPublicQuizeeImplementation, [checkAppCheck, ...getPublicQuizeeCheckList])
);

export const onUserCreated = functions.auth.user().onCreate(onUserCreatedImplementation);
export const onUserDeleted = functions.auth.user().onDelete(onUserDeletedImplementation);
