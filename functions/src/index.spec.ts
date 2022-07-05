/* eslint-disable @typescript-eslint/no-explicit-any */
import { checkAnswers, getQuizeeList } from '.';

import { Answer, Question, QuestionType, Quiz } from '@di-strix/quizee-types';

import * as admin from 'firebase-admin';
import { https } from 'firebase-functions';
import firebaseFunctionsTest from 'firebase-functions-test';
import { WrappedFunction } from 'firebase-functions-test/lib/v1';

import { FirestoreMock } from './firestore.mock';
import { callWithChecks, checkAppCheck } from './functionPreprocessor';

const { wrap, cleanup } = firebaseFunctionsTest();

jest.mock('firebase-functions', () => {
  return {
    ...jest.requireActual('firebase-functions'),
    logger: {
      debug: jest.fn(),
      error: jest.fn(),
      info: jest.fn(),
      log: jest.fn(),
      warn: jest.fn(),
      write: jest.fn(),
    },
  };
});

jest.mock('firebase-admin', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const FirestoreMock = require('./firestore.mock').FirestoreMock;
  const firestore = new FirestoreMock();

  return {
    initializeApp: jest.fn(),
    firestore: () => firestore,
  };
});

describe('Quizee cloud functions', () => {
  let firestore: FirestoreMock;

  describe('getQuizeeList', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let fn: WrappedFunction<any>;

    beforeEach(() => {
      fn = wrap(getQuizeeList);
      firestore = admin.firestore() as any;
    });

    it('should throw if app is not verified', async () => {
      await expect(fn(null)).rejects.toThrowError();
    });

    it('should return array of quiz infos', async () => {
      const mockInfo = { val: 1 };
      firestore.store = { quizees: { quiz1: { info: mockInfo }, quiz2: { info: mockInfo } } };

      await expect(fn(null, { app: {} })).resolves.toEqual([mockInfo, mockInfo]);
    });
  });

  describe('checkAnswers', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let fn: WrappedFunction<any>;

    beforeEach(() => {
      fn = wrap(checkAnswers);
      firestore = admin.firestore() as any;
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
      firestore.store = {
        quizees: {},
      };

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
      firestore.store = {
        quizees: {
          '2aa2ffe7-ec2c-4305-b96b-95fb91609d6b': {
            answers: [{}, {}] as Answer[],
          },
        },
      };

      await expect(
        fn(
          {
            answers: [{ answer: [], answerTo: '2aa2ffe7-ec2c-4305-b96b-95fb91609d6b' }],
            quizId: '2aa2ffe7-ec2c-4305-b96b-95fb91609d6b',
          },
          { app: {} }
        )
      ).rejects.toThrowError(/Answers count don't equal/);
    });

    it('should skip if question type cannot be determined', async () => {
      firestore.store = {
        quizees: {
          '2aa2ffe7-ec2c-4305-b96b-95fb91609d6b': {
            questions: [{ id: '123' }] as Question[],
            answers: [{ answer: ['1'], answerTo: '111' }] as Answer[],
          },
        },
      };

      await expect(
        fn(
          {
            answers: [{ answer: ['1'], answerTo: '2aa2ffe7-ec2c-4305-b96b-95fb91609d6b' }],
            quizId: '2aa2ffe7-ec2c-4305-b96b-95fb91609d6b',
          },
          { app: {} }
        )
      ).resolves.toEqual(0);
    });

    describe('should calculate results correctly', () => {
      const generateMockStore = (answers: string[], type: QuestionType, config: Partial<Answer['config']> = {}) => ({
        quizees: {
          '2aa2ffe7-ec2c-4305-b96b-95fb91609d6b': {
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
          } as Quiz,
        },
      });

      describe('SEVERAL_TRUE', () => {
        test('single correct answer ', async () => {
          firestore.store = generateMockStore(['1'], 'SEVERAL_TRUE');

          await expect(
            fn(
              {
                answers: [
                  {
                    answer: ['1'],
                    answerTo: '2aa2ffe7-ec2c-4305-b96b-95fb91609d6b',
                  },
                ],
                quizId: '2aa2ffe7-ec2c-4305-b96b-95fb91609d6b',
              },
              { app: {} }
            )
          ).resolves.toBe(100);
        });

        test('multiple correct answers', async () => {
          firestore.store = generateMockStore(['1', '2'], 'SEVERAL_TRUE');

          await expect(
            fn(
              {
                answers: [
                  {
                    answer: ['2', '1'],
                    answerTo: '2aa2ffe7-ec2c-4305-b96b-95fb91609d6b',
                  },
                ],
                quizId: '2aa2ffe7-ec2c-4305-b96b-95fb91609d6b',
              },
              { app: {} }
            )
          ).resolves.toBe(100);
        });

        test('one missing correct answer', async () => {
          firestore.store = generateMockStore(['1', '2'], 'SEVERAL_TRUE');

          await expect(
            fn(
              {
                answers: [
                  {
                    answer: ['1'],
                    answerTo: '2aa2ffe7-ec2c-4305-b96b-95fb91609d6b',
                  },
                ],
                quizId: '2aa2ffe7-ec2c-4305-b96b-95fb91609d6b',
              },
              { app: {} }
            )
          ).resolves.toBe(50);
        });

        test('one incorrect answer', async () => {
          firestore.store = generateMockStore(['1', '2'], 'SEVERAL_TRUE');

          await expect(
            fn(
              {
                answers: [
                  {
                    answer: ['1', '3'],
                    answerTo: '2aa2ffe7-ec2c-4305-b96b-95fb91609d6b',
                  },
                ],
                quizId: '2aa2ffe7-ec2c-4305-b96b-95fb91609d6b',
              },
              { app: {} }
            )
          ).resolves.toBe(50);
        });
      });

      describe('ONE_TRUE', () => {
        test('correct answer ', async () => {
          firestore.store = generateMockStore(['1'], 'ONE_TRUE');

          await expect(
            fn(
              {
                answers: [
                  {
                    answer: ['1'],
                    answerTo: '2aa2ffe7-ec2c-4305-b96b-95fb91609d6b',
                  },
                ],
                quizId: '2aa2ffe7-ec2c-4305-b96b-95fb91609d6b',
              },
              { app: {} }
            )
          ).resolves.toBe(100);
        });

        test('incorrect answer', async () => {
          firestore.store = generateMockStore(['1'], 'ONE_TRUE');

          await expect(
            fn(
              {
                answers: [
                  {
                    answer: ['2'],
                    answerTo: '2aa2ffe7-ec2c-4305-b96b-95fb91609d6b',
                  },
                ],
                quizId: '2aa2ffe7-ec2c-4305-b96b-95fb91609d6b',
              },
              { app: {} }
            )
          ).resolves.toBe(0);
        });
      });

      describe('WRITE_ANSWER', () => {
        test('correct answer ', async () => {
          firestore.store = generateMockStore(['answer'], 'WRITE_ANSWER');

          await expect(
            fn(
              {
                answers: [
                  {
                    answer: ['answer'],
                    answerTo: '2aa2ffe7-ec2c-4305-b96b-95fb91609d6b',
                  },
                ],
                quizId: '2aa2ffe7-ec2c-4305-b96b-95fb91609d6b',
              },
              { app: {} }
            )
          ).resolves.toBe(100);
        });

        test('incorrect answer', async () => {
          firestore.store = generateMockStore(['answer'], 'WRITE_ANSWER');

          await expect(
            fn(
              {
                answers: [
                  {
                    answer: ['another answer'],
                    answerTo: '2aa2ffe7-ec2c-4305-b96b-95fb91609d6b',
                  },
                ],
                quizId: '2aa2ffe7-ec2c-4305-b96b-95fb91609d6b',
              },
              { app: {} }
            )
          ).resolves.toBe(0);
        });

        describe('config', () => {
          it('should not check case', async () => {
            firestore.store = generateMockStore(['answer'], 'WRITE_ANSWER', { equalCase: false });

            await expect(
              fn(
                {
                  answers: [
                    {
                      answer: ['answer'],
                      answerTo: '2aa2ffe7-ec2c-4305-b96b-95fb91609d6b',
                    },
                  ],
                  quizId: '2aa2ffe7-ec2c-4305-b96b-95fb91609d6b',
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
                  quizId: '2aa2ffe7-ec2c-4305-b96b-95fb91609d6b',
                },
                { app: {} }
              )
            ).resolves.toBe(100);
          });

          it('should check case', async () => {
            firestore.store = generateMockStore(['answer'], 'WRITE_ANSWER', { equalCase: true });

            await expect(
              fn(
                {
                  answers: [
                    {
                      answer: ['Answer'],
                      answerTo: '2aa2ffe7-ec2c-4305-b96b-95fb91609d6b',
                    },
                  ],
                  quizId: '2aa2ffe7-ec2c-4305-b96b-95fb91609d6b',
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
                  quizId: '2aa2ffe7-ec2c-4305-b96b-95fb91609d6b',
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
                  quizId: '2aa2ffe7-ec2c-4305-b96b-95fb91609d6b',
                },
                { app: {} }
              )
            ).resolves.toBe(100);
          });
        });
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
    });
  });

  afterAll(() => {
    cleanup();
  });
});
