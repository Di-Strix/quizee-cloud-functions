import { Answer, QuestionType, Quiz, QuizId } from '@di-strix/quizee-types';
import { QuizeeSchemas } from '@di-strix/quizee-verification-functions';

import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import * as Joi from 'joi';

admin.initializeApp();

export const getQuizeesList = functions.https.onCall(async (_, context) => {
  if (context.app == undefined) {
    throw new functions.https.HttpsError(
      'failed-precondition',
      'The function must be called from an App Check verified app.'
    );
  }

  let dbData: { [key: QuizId]: Quiz } = {};

  await admin
    .database()
    .ref('quizees')
    .limitToFirst(50)
    .once('value', (snapshot) => (dbData = snapshot.val()));

  const responseData = Object.keys(dbData).map((quizeeId) => ({
    caption: dbData[quizeeId].info.caption,
    img: dbData[quizeeId].info.img,
    questionsCount: dbData[quizeeId].info.questionsCount,
    id: quizeeId,
  }));

  return responseData;
});

export const checkAnswers = functions.https.onCall(async (data: { answers: Answer[]; quizId: QuizId }, context) => {
  if (context.app == undefined) {
    throw new functions.https.HttpsError(
      'failed-precondition',
      'The function must be called from an App Check verified app.'
    );
  }

  try {
    await Joi.object({
      answers: Joi.array().items(QuizeeSchemas.answerSchema).required(),
      quizId: QuizeeSchemas.quizeeInfoSchema.extract('id').disallow('').required(),
    }).validateAsync(data);
  } catch (e) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid input');
  }

  const userAnswers = data.answers;
  let quiz!: Quiz;
  await admin
    .database()
    .ref('quizees/' + data.quizId)
    .once('value', (snapshot) => (quiz = snapshot.val()));

  const checkCases: {
    [Type in QuestionType]: (questionPair: Answer, userAnswers: Answer['answer']) => number;
  } = {
    SEVERAL_TRUE: ({ answer: answers }, userAnswers) => {
      const factor = 1 / answers.length;
      const result = userAnswers.reduce((acc, val) => {
        if (answers.includes(val)) acc += factor;
        else acc -= factor;
        return acc;
      }, 0);

      return result < 0 ? 0 : result;
    },
    ONE_TRUE: ({ answer: answers }, userAnswer) => Number(answers[0] === userAnswer[0]),
    WRITE_ANSWER: (answer, userAnswer) => {
      const map = <T>(mappers: Array<(arg: T) => T>, startValue: T) =>
        mappers.reduce((acc, mapper) => mapper(acc), startValue);

      const userAnswerMappers: Array<(userAnswer: string) => string> = [];
      const actualAnswerMappers: Array<(actualAnswer: string) => string> = [];

      if (!answer.config.equalCase) {
        const upperCaser = (str: string) => str.toUpperCase();
        userAnswerMappers.push(upperCaser);
        actualAnswerMappers.push(upperCaser);
      }

      return Number(map(actualAnswerMappers, answer.answer[0]) === map(userAnswerMappers, userAnswer[0]));
    },
  };

  const correctAnswers = quiz.answers;

  if (userAnswers.length != correctAnswers.length) throw new Error("Answers count don't equal");
  const factor = 100 / correctAnswers.length;
  const result = correctAnswers.reduce((acc, actualAnswer, index) => {
    const questionType = quiz.questions.find((question) => question.id === actualAnswer.answerTo)?.type;

    if (!questionType) {
      console.log('Invalid question type');
      return acc;
    }

    console.log(index, questionType, actualAnswer);
    const handler = checkCases[questionType];

    acc += factor * handler(actualAnswer, userAnswers[index].answer);
    acc = parseFloat(acc.toFixed(1));
    return acc;
  }, 0);

  return result;
});
