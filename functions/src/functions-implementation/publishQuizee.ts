import { PublishQuizee } from '@di-strix/quizee-cloud-functions-interfaces';
import { QuizeeSchemas } from '@di-strix/quizee-verification-functions';

import * as admin from 'firebase-admin';

import { CheckList, CloudFunction, checkAuth } from '../functionPreprocessor';

import { onUserCreatedImplementation } from './onUserCreated';
import { User } from './user';

export const publishQuizeeCheckList: CheckList = [
  checkAuth,
  async (data) => {
    const { error } = QuizeeSchemas.quizeeSchema.validate(data);

    return {
      passed: !error,
      code: 'invalid-argument',
      message: 'Invalid input',
    };
  },
];

export const publishQuizeeImplementation: CloudFunction<PublishQuizee.Function> = async (quiz, context) => {
  const fixedContext = context as Required<typeof context>;

  const userRef = await admin.firestore().collection('users').doc(fixedContext.auth.uid);

  await userRef
    .get()
    .then((user) => {
      if (!user.exists) throw new Error("User data doesn't exist");
    })
    .catch(async () => {
      const userRecord = await admin.auth().getUser(fixedContext.auth.uid);
      await onUserCreatedImplementation(userRecord);
    });

  const quizeeRef = await admin.firestore().collection('quizees').doc();
  quiz.info.id = quizeeRef.id;

  await quizeeRef.create(quiz);

  await userRef.update({
    quizees: admin.firestore.FieldValue.arrayUnion(quizeeRef),
  } as Partial<Map<User, unknown>>);

  return { quizId: quizeeRef.id };
};
