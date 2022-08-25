/* eslint-disable @typescript-eslint/no-explicit-any */
import { checkAnswers, getQuizeeList, onUserCreated, onUserDeleted, publishQuizee } from '.';

import { Answer, Question, QuestionType, Quiz } from '@di-strix/quizee-types';
import { QuizeeSchemas } from '@di-strix/quizee-verification-functions';

import { auth, firestore } from 'firebase-admin';
import { https } from 'firebase-functions';
import firebaseFunctionsTest from 'firebase-functions-test';
import { WrappedFunction } from 'firebase-functions-test/lib/v1';

import { callWithChecks, checkAppCheck, checkAuth } from './functionPreprocessor';
import { User } from './functions-implementation/user';

process.env.GCLOUD_PROJECT = 'demo-testing-project';
process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST = 'localhost:9099';

jest.mock('firebase-functions', () => ({
  ...jest.requireActual('firebase-functions'),
  logger: {
    debug: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    log: jest.fn(),
    warn: jest.fn(),
    write: jest.fn(),
  },
}));

const { wrap, cleanup } = firebaseFunctionsTest();

describe('Quizee cloud functions', () => {
  beforeEach(async () => {
    const collections = await firestore().listCollections();
    await Promise.all(collections.map((collection) => firestore().recursiveDelete(collection)));
  });

  describe('getQuizeeList', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let fn: WrappedFunction<any>;

    beforeEach(async () => {
      fn = wrap(getQuizeeList);
    });

    it('should throw if app is not verified', async () => {
      await expect(fn(null)).rejects.toThrowError();
    });

    it('should return array of quiz infos', async () => {
      const mockInfo = { val: 1 };

      await firestore().collection('quizees').add({ info: mockInfo });
      await firestore().collection('quizees').add({ info: mockInfo });

      await expect(fn(null, { app: {} })).resolves.toEqual([mockInfo, mockInfo]);
    });

    it('should return empty array if no quizees', async () => {
      await expect(fn(null, { app: {} })).resolves.toEqual([]);
    });
  });

  describe('checkAnswers', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let fn: WrappedFunction<any>;

    beforeEach(() => {
      fn = wrap(checkAnswers);
    });

    it('should throw if app is not verified', async () => {
      await expect(fn(null)).rejects.toThrowError();
    });

    it('should validate input', async () => {
      await expect(fn({}, { app: {} })).rejects.toThrowError(/Invalid input/);
      await expect(fn({ answers: [] }, { app: {} })).rejects.toThrowError(/Invalid input/);
      await expect(fn({ answers: [], quizId: '' }, { app: {} })).rejects.toThrowError(/Invalid input/);
      await expect(fn({ answers: [{}], quizId: '' }, { app: {} })).rejects.toThrowError(/Invalid input/);
      await expect(
        fn(
          {
            answers: [{ answer: [], answerTo: '' }],
            quizId: '',
          },
          { app: {} }
        )
      ).rejects.toThrowError(/Invalid input/);
    });

    it('should throw if quizee does not exist', async () => {
      await firestore().collection('quizees').add({ mockQuizee: '1' });

      await expect(
        fn(
          {
            answers: [{ answer: [], answerTo: '2aa2ffe7-ec2c-4305-b96b-95fb91609d6b' }],
            quizId: '2aa2ffe7-ec2c-4305-b96b-95fb91609d6b',
          },
          { app: {} }
        )
      ).rejects.toThrowError(/Invalid Quizee id/);
    });

    it('should throw on user answers count and quizee answers count mismatch', async () => {
      const doc = await firestore()
        .collection('quizees')
        .add({ answers: [{}, {}] as Answer[] });

      await expect(
        fn(
          {
            answers: [{ answer: [], answerTo: '2aa2ffe7-ec2c-4305-b96b-95fb91609d6b' }],
            quizId: doc.id,
          },
          { app: {} }
        )
      ).rejects.toThrowError(/Answers count don't equal/);
    });

    it('should throw if question type cannot be determined', async () => {
      const doc = await firestore()
        .collection('quizees')
        .add({ questions: [{ id: '123' }] as Question[], answers: [{ answer: ['1'], answerTo: '111' }] as Answer[] });

      await expect(
        fn(
          {
            answers: [{ answer: ['1'], answerTo: '2aa2ffe7-ec2c-4305-b96b-95fb91609d6b' }],
            quizId: doc.id,
          },
          { app: {} }
        )
      ).resolves.toEqual(0);
    });

    describe('should calculate results correctly', () => {
      const generateMockQuiz = (answers: string[], type: QuestionType, config: Partial<Answer['config']> = {}) =>
        ({
          questions: [
            {
              answerOptions: [],
              caption: '',
              id: '2aa2ffe7-ec2c-4305-b96b-95fb91609d6b',
              type,
            },
          ],
          answers: [
            {
              answer: answers,
              answerTo: '2aa2ffe7-ec2c-4305-b96b-95fb91609d6b',
              config: { equalCase: false, ...config },
            },
          ],
          info: {
            caption: '',
            id: '',
            img: '',
            questionsCount: 0,
          },
        } as Quiz);

      describe('SEVERAL_TRUE', () => {
        test('single correct answer ', async () => {
          const doc = await firestore()
            .collection('quizees')
            .add(generateMockQuiz(['1'], 'SEVERAL_TRUE'));

          await expect(
            fn(
              {
                answers: [
                  {
                    answer: ['1'],
                    answerTo: '2aa2ffe7-ec2c-4305-b96b-95fb91609d6b',
                  },
                ],
                quizId: doc.id,
              },
              { app: {} }
            )
          ).resolves.toBe(100);
        });

        test('multiple correct answers', async () => {
          const doc = await firestore()
            .collection('quizees')
            .add(generateMockQuiz(['1', '2'], 'SEVERAL_TRUE'));

          await expect(
            fn(
              {
                answers: [
                  {
                    answer: ['2', '1'],
                    answerTo: '2aa2ffe7-ec2c-4305-b96b-95fb91609d6b',
                  },
                ],
                quizId: doc.id,
              },
              { app: {} }
            )
          ).resolves.toBe(100);
        });

        test('one missing correct answer', async () => {
          const doc = await firestore()
            .collection('quizees')
            .add(generateMockQuiz(['1', '2'], 'SEVERAL_TRUE'));

          await expect(
            fn(
              {
                answers: [
                  {
                    answer: ['1'],
                    answerTo: '2aa2ffe7-ec2c-4305-b96b-95fb91609d6b',
                  },
                ],
                quizId: doc.id,
              },
              { app: {} }
            )
          ).resolves.toBe(50);
        });

        test('one incorrect answer', async () => {
          const doc = await firestore()
            .collection('quizees')
            .add(generateMockQuiz(['1', '2'], 'SEVERAL_TRUE'));

          await expect(
            fn(
              {
                answers: [
                  {
                    answer: ['1', '3'],
                    answerTo: '2aa2ffe7-ec2c-4305-b96b-95fb91609d6b',
                  },
                ],
                quizId: doc.id,
              },
              { app: {} }
            )
          ).resolves.toBe(50);
        });
      });

      describe('ONE_TRUE', () => {
        test('correct answer ', async () => {
          const doc = await firestore()
            .collection('quizees')
            .add(generateMockQuiz(['1'], 'ONE_TRUE'));

          await expect(
            fn(
              {
                answers: [
                  {
                    answer: ['1'],
                    answerTo: '2aa2ffe7-ec2c-4305-b96b-95fb91609d6b',
                  },
                ],
                quizId: doc.id,
              },
              { app: {} }
            )
          ).resolves.toBe(100);
        });

        test('incorrect answer', async () => {
          const doc = await firestore()
            .collection('quizees')
            .add(generateMockQuiz(['1'], 'ONE_TRUE'));

          await expect(
            fn(
              {
                answers: [
                  {
                    answer: ['2'],
                    answerTo: '2aa2ffe7-ec2c-4305-b96b-95fb91609d6b',
                  },
                ],
                quizId: doc.id,
              },
              { app: {} }
            )
          ).resolves.toBe(0);
        });
      });

      describe('WRITE_ANSWER', () => {
        test('correct answer ', async () => {
          const doc = await firestore()
            .collection('quizees')
            .add(generateMockQuiz(['answer'], 'WRITE_ANSWER'));

          await expect(
            fn(
              {
                answers: [
                  {
                    answer: ['answer'],
                    answerTo: '2aa2ffe7-ec2c-4305-b96b-95fb91609d6b',
                  },
                ],
                quizId: doc.id,
              },
              { app: {} }
            )
          ).resolves.toBe(100);
        });

        test('incorrect answer', async () => {
          const doc = await firestore()
            .collection('quizees')
            .add(generateMockQuiz(['answer'], 'WRITE_ANSWER'));

          await expect(
            fn(
              {
                answers: [
                  {
                    answer: ['another answer'],
                    answerTo: '2aa2ffe7-ec2c-4305-b96b-95fb91609d6b',
                  },
                ],
                quizId: doc.id,
              },
              { app: {} }
            )
          ).resolves.toBe(0);
        });

        describe('config', () => {
          it('should not check case', async () => {
            const doc = await firestore()
              .collection('quizees')
              .add(generateMockQuiz(['answer'], 'WRITE_ANSWER', { equalCase: false }));

            await expect(
              fn(
                {
                  answers: [
                    {
                      answer: ['answer'],
                      answerTo: '2aa2ffe7-ec2c-4305-b96b-95fb91609d6b',
                    },
                  ],
                  quizId: doc.id,
                },
                { app: {} }
              )
            ).resolves.toBe(100);

            await expect(
              fn(
                {
                  answers: [
                    {
                      answer: ['ANSWer'],
                      answerTo: '2aa2ffe7-ec2c-4305-b96b-95fb91609d6b',
                    },
                  ],
                  quizId: doc.id,
                },
                { app: {} }
              )
            ).resolves.toBe(100);
          });

          it('should check case', async () => {
            const doc = await firestore()
              .collection('quizees')
              .add(generateMockQuiz(['answer'], 'WRITE_ANSWER', { equalCase: true }));

            await expect(
              fn(
                {
                  answers: [
                    {
                      answer: ['Answer'],
                      answerTo: '2aa2ffe7-ec2c-4305-b96b-95fb91609d6b',
                    },
                  ],
                  quizId: doc.id,
                },
                { app: {} }
              )
            ).resolves.toBe(0);

            await expect(
              fn(
                {
                  answers: [
                    {
                      answer: ['ANSWER'],
                      answerTo: '2aa2ffe7-ec2c-4305-b96b-95fb91609d6b',
                    },
                  ],
                  quizId: doc.id,
                },
                { app: {} }
              )
            ).resolves.toBe(0);

            await expect(
              fn(
                {
                  answers: [
                    {
                      answer: ['answer'],
                      answerTo: '2aa2ffe7-ec2c-4305-b96b-95fb91609d6b',
                    },
                  ],
                  quizId: doc.id,
                },
                { app: {} }
              )
            ).resolves.toBe(100);
          });
        });
      });
    });
  });

  describe('onUserCreated', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let fn: WrappedFunction<any>;

    beforeEach(() => {
      fn = wrap(onUserCreated);
    });

    it(`should create user object under user's id`, async () => {
      const uid = 'mockUid';

      await fn({ uid });

      const user = await firestore().collection('users').doc('mockUid').get();

      expect(user.exists).toBeTruthy();
      expect(user.data()?.quizees).toEqual([]);
    });
  });

  describe('onUserDeleted', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let fn: WrappedFunction<any>;

    beforeEach(() => {
      fn = wrap(onUserDeleted);
    });

    it('should do nothing if user does not exist', async () => {
      const uid = 'mockUid';

      await expect(fn({ uid })).resolves.not.toThrow();
    });

    it(`should delete all user's quizees and user object`, async () => {
      const uid = 'mockUid';

      const mockQuizee1Ref = await firestore().collection('quizees').add({ quiz: 1 });
      const mockQuizee2Ref = await firestore().collection('quizees').add({ quiz: 2 });
      const mockQuizee3Ref = await firestore().collection('quizees').add({ quiz: 3 });

      const mockUserRef = firestore().collection('users').doc(uid);
      await mockUserRef.create({ quizees: [mockQuizee1Ref, mockQuizee2Ref] });

      await fn({ uid });

      expect((await mockUserRef.get()).exists).toBeFalsy();
      expect((await mockQuizee1Ref.get()).exists).toBeFalsy();
      expect((await mockQuizee2Ref.get()).exists).toBeFalsy();
      expect((await mockQuizee3Ref.get()).exists).toBeTruthy();
    });
  });

  describe('publishQuizee', () => {
    let fn: WrappedFunction<any>;

    beforeEach(() => {
      fn = wrap(publishQuizee);
    });

    describe('precondition', () => {
      it('should throw if app is not verified', async () => {
        await expect(fn(null)).rejects.toThrowError(/App Check verified app/);
      });

      it('should throw if no auth', async () => {
        await expect(
          fn({ answers: [], info: { caption: '', id: '', img: '', questionsCount: 0 }, questions: [] } as Quiz, {
            app: {},
          })
        ).rejects.toThrow(/Authentication required/);
      });

      it('should call validator with provided quiz', async () => {
        const user = await auth().createUser({});

        const validate = jest.spyOn(QuizeeSchemas.quizeeSchema, 'validate');

        await expect(fn({}, { app: {}, auth: user })).rejects.toThrow(/Invalid input/);

        expect(validate).toBeCalledTimes(1);
      });

      it('should throw if quizee is invalid', async () => {
        const user = await auth().createUser({});

        await expect(fn({}, { app: {}, auth: user })).rejects.toThrow(/Invalid input/);
      });
    });

    describe('implementation', () => {
      it('should create user data if it does not exist', async () => {
        const user = await auth().createUser({});
        const quizee = { info: { caption: 'mockCaption', id: '' } };

        jest.spyOn(QuizeeSchemas.quizeeSchema, 'validate').mockReturnValue({ error: false } as any);

        await fn(quizee, { app: {}, auth: user });

        const userRef = firestore().collection('users').doc(user.uid);
        const userSnapshot = await userRef.get();

        expect(userSnapshot.exists).toBeTruthy();
      });

      it('should add quizee and update its id', async () => {
        const user = await auth().createUser({});
        const quizee = { info: { caption: 'mockCaption', id: '' } };

        jest.spyOn(QuizeeSchemas.quizeeSchema, 'validate').mockReturnValue({ error: false } as any);

        await fn(quizee, { app: {}, auth: user });

        const quizeeList = await firestore().collection('quizees').listDocuments();

        expect(quizeeList.length).toEqual(1);

        const quizeeRef = quizeeList[0];
        const quizeeData = (await quizeeRef.get()).data();
        expect(quizeeData).toEqual({ ...quizee, info: { ...quizee.info, id: quizeeRef.id } });
      });

      it("should add quizee reference to user's quizees", async () => {
        const user = await auth().createUser({});
        const quizee = { info: { caption: 'mockCaption', id: '' } };

        jest.spyOn(QuizeeSchemas.quizeeSchema, 'validate').mockReturnValue({ error: false } as any);

        await fn(quizee, { app: {}, auth: user });

        const quizeeList = await firestore().collection('quizees').listDocuments();

        expect(quizeeList.length).toEqual(1);

        const quizeeRef = quizeeList[0];
        const userData = (await firestore().collection('users').doc(user.uid).get()).data() as User;

        expect(userData.quizees).toEqual([quizeeRef]);
      });

      it("should push quizee reference to user's quizees", async () => {
        const user = await auth().createUser({});
        const quizee1 = { info: { caption: 'mockCaption', id: '1' } };
        const quizee2 = { info: { caption: 'mockCaption', id: '2' } };

        jest.spyOn(QuizeeSchemas.quizeeSchema, 'validate').mockReturnValue({ error: false } as any);

        const { quizId: quiz1Id } = await fn(quizee1, { app: {}, auth: user });
        const { quizId: quiz2Id } = await fn(quizee2, { app: {}, auth: user });

        const quizee1Ref = await firestore().collection('quizees').doc(quiz1Id);
        const quizee2Ref = await firestore().collection('quizees').doc(quiz2Id);

        const userData = (await firestore().collection('users').doc(user.uid).get()).data() as User;

        expect(userData.quizees.length).toBe(2);
        expect(userData.quizees).toContainEqual(quizee1Ref);
        expect(userData.quizees).toContainEqual(quizee2Ref);
      });
    });
  });

  describe('function preprocessor', () => {
    let targetFn: jest.Mock<any, any>;

    beforeEach(() => {
      targetFn = jest.fn();
    });

    it('should call target function', async () => {
      await expect((callWithChecks(targetFn) as any)()).resolves.not.toThrow();

      expect(targetFn).toBeCalledTimes(1);
    });

    it('should run all provided checks', async () => {
      const checkCases = [jest.fn(), jest.fn()];

      checkCases.forEach((fn) => fn.mockReturnValue({ passed: true }));

      await expect((callWithChecks(targetFn, checkCases) as any)()).resolves.not.toThrow();

      expect(checkCases[0]).toBeCalledTimes(1);
      expect(checkCases[1]).toBeCalledTimes(1);
      expect(targetFn).toBeCalledTimes(1);
    });

    it('should throw if check failed', async () => {
      const checkCases = [jest.fn(), jest.fn()];

      checkCases[0].mockReturnValue({ passed: true });
      checkCases[1].mockReturnValue({ passed: false, code: '', message: 'mockError' });

      await expect((callWithChecks(targetFn, checkCases) as any)()).rejects.toThrowError(/mockError/);

      expect(checkCases[0]).toBeCalledTimes(1);
      expect(checkCases[1]).toBeCalledTimes(1);
      expect(targetFn).not.toBeCalled();
    });

    it('should set default values for error if no provided', async () => {
      await expect((callWithChecks(jest.fn(), [() => ({ passed: false })]) as any)()).rejects.toThrowError(
        new https.HttpsError('internal', '')
      );
    });

    describe('builtin checkers', () => {
      describe('checkAppCheck', () => {
        it('should pass if app is authorized', () => {
          expect(checkAppCheck(null, { app: {} } as any).passed).toBeTruthy();
        });

        it('should not pass if app is not authorized', () => {
          expect(checkAppCheck(null, {} as any).passed).toBeFalsy();
        });
      });

      describe('checkAuth', () => {
        it('should pass if authenticated', () => {
          expect(checkAuth(null, { auth: {} } as any).passed).toBeTruthy();
        });

        it('should not pass if not authenticated', () => {
          expect(checkAuth(null, {} as any).passed).toBeFalsy();
        });
      });
    });
  });

  afterAll(async () => {
    await cleanup();
  });
});
