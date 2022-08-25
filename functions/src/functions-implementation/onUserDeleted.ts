import { firestore } from 'firebase-admin';
import { auth, logger } from 'firebase-functions';

import { User } from './user';

export const onUserDeletedImplementation = async (user: auth.UserRecord) => {
  const userRef = firestore().collection('users').doc(user.uid);
  const snapshot = await userRef.get();
  if (!snapshot.exists) return;

  const userData = snapshot.data() as User;

  logger.warn('Deleting user');

  await Promise.all(
    userData.quizees.map(async (ref) => {
      return firestore().recursiveDelete(ref);
    })
  );

  await userRef.delete();
};
