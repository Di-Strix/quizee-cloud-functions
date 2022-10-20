import { CheckAnswers } from '@di-strix/quizee-cloud-functions-interfaces';
import { Answer, QuestionType, Quiz } from '@di-strix/quizee-types';
import { QuizeeSchemas } from '@di-strix/quizee-verification-functions';

import * as admin from 'firebase-admin';
import { https, logger } from 'firebase-functions';
import * as Joi from 'joi';

import { CheckList, CloudFunction } from '../functionPreprocessor';

export const checkAnswersCheckList: CheckList = [
  async (data) => {
    const { error } = Joi.object({
      answers: Joi.array()
        .items(
          Joi.object({
            answer: QuizeeSchemas.answerSchema.extract('answer'),
            answerTo: QuizeeSchemas.answerSchema.extract('answerTo'),
          })
        )
        .required(),
      quizId: QuizeeSchemas.quizeeInfoSchema.extract('id').disallow('').required(),
    }).validate(data);

    return {
      passed: !error,
      code: 'invalid-argument',
      message: 'Invalid input',
    };
  },
];

export const checkAnswersImplementation: CloudFunction<CheckAnswers.Function> = async (data) => {
  const userAnswers = data.answers;
  const quiz: Quiz = await admin
    .firestore()
    .collection('quizees')
    .doc(data.quizId)
    .get()
    .then((snapshot) => {
      if (!snapshot.exists) throw new https.HttpsError('invalid-argument', 'Invalid Quizee id');
      return snapshot.data() as Quiz;
    });

  const checkCases: {
    [Type in QuestionType]: (answer: Answer, userAnswers: Answer['answer']) => number;
  } = {
    SEVERAL_TRUE: ({ answer: correctAnswers }, userAnswers) => {
      const factor = 1 / correctAnswers.length;

      let result = userAnswers.reduce((acc, val) => {
        if (correctAnswers.includes(val)) acc += factor;
        return acc;
      }, 0);

      result -= Math.max(0, userAnswers.length - correctAnswers.length);

      return Math.max(result, 0);
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

  if (userAnswers.length != correctAnswers.length)
    throw new https.HttpsError('invalid-argument', "Answers count don't equal");

  const factor = 100 / correctAnswers.length;
  const result = correctAnswers.reduce((acc, actualAnswer, index) => {
    const questionType = quiz.questions.find((question) => question.id === actualAnswer.answerTo)?.type;

    if (!questionType) {
      throw new https.HttpsError('invalid-argument', 'Invalid question type. The problem is with the quiz itself', {
        quizId: data.quizId,
        questionId: actualAnswer.answerTo,
      });
    }

    logger.debug(index, questionType, actualAnswer);
    const handler = checkCases[questionType];

    acc += factor * handler(actualAnswer, userAnswers[index].answer);
    acc = +acc.toFixed(1);
    return acc;
  }, 0);

  return result;
};
