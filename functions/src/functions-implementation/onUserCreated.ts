import { firestore } from 'firebase-admin';
import { auth } from 'firebase-functions';
import { User } from './user';

export const onUserCreatedImplementation = async (user: auth.UserRecord) => {
  await firestore()
    .collection('users')
    .doc(user.uid)
    .create({ quizees: [] } as User);
};
