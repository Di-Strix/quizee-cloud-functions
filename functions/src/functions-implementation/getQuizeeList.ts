import { GetQuizeeListFunction } from '@di-strix/quizee-cloud-functions-interfaces';
import { QuizInfo } from '@di-strix/quizee-types';

import * as admin from 'firebase-admin';

import { CloudFunction } from '../functionPreprocessor';

export const getQuizeeListCheckList = [];

export const getQuizeeListImplementation: CloudFunction<GetQuizeeListFunction> = async () => {
  const response: QuizInfo[] = await admin
    .firestore()
    .collection('quizees')
    .get()
    .then((snapshot) => snapshot.docs.map((snapshot) => snapshot.data().info));

  return response;
};
