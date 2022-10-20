import { GetFullQuizee } from '@di-strix/quizee-cloud-functions-interfaces';
import { Quiz } from '@di-strix/quizee-types';

import * as admin from 'firebase-admin';
import { https } from 'firebase-functions';

import { CheckList, CloudFunction, checkAuth } from '../functionPreprocessor';

import { User } from './user';

export const getFullQuizeeCheckList: CheckList = [
  checkAuth,
  async (data, context) => {
    if (typeof data !== 'string')
      return { passed: false, code: 'invalid-argument', message: 'QuizId must be valid quizee id' };

    const auth = context.auth as Required<typeof context>['auth'];
    const uid = auth.uid;
    const userSnapshot = await admin.firestore().collection('users').doc(uid).get();

    if (!userSnapshot.exists) return { passed: false, code: 'not-found', message: 'User was not found' };

    const userData = userSnapshot.data() as User;

    const quizeeRef = admin.firestore().collection('quizees').doc(data);
    if (!userData.quizees.some((ref) => quizeeRef.isEqual(ref)))
      return { passed: false, code: 'permission-denied', message: 'You are not the owner of the quizee' };

    return { passed: true };
  },
];

export const getFullQuizeeImplementation: CloudFunction<GetFullQuizee.Function> = async (data) => {
  return admin
    .firestore()
    .collection('quizees')
    .doc(data)
    .get()
    .then((snapshot) => {
      if (!snapshot.exists) throw new https.HttpsError('not-found', 'Requested quizee was not found');
      return snapshot.data() as Quiz;
    });
};
