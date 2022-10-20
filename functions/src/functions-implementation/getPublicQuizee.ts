import { GetPublicQuizee } from '@di-strix/quizee-cloud-functions-interfaces';
import { Quiz } from '@di-strix/quizee-types';

import * as admin from 'firebase-admin';
import { https } from 'firebase-functions';

import { CheckList, CloudFunction } from '../functionPreprocessor';

export const getPublicQuizeeCheckList: CheckList = [];

export const getPublicQuizeeImplementation: CloudFunction<GetPublicQuizee.Function> = async (data) => {
  return admin
    .firestore()
    .collection('quizees')
    .doc(data)
    .get()
    .then((snapshot) => {
      if (!snapshot.exists) throw new https.HttpsError('not-found', 'Requested quizee was not found');
      const quiz = snapshot.data() as Quiz;
      return { info: quiz.info, questions: quiz.questions } as Omit<Quiz, 'answers'>;
    });
};
