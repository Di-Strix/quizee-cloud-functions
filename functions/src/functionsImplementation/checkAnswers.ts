import { CheckAnswersFunction } from '@di-strix/quizee-cloud-functions-interfaces';
import { Answer, QuestionType, Quiz } from '@di-strix/quizee-types';
import { QuizeeSchemas } from '@di-strix/quizee-verification-functions';

import * as admin from 'firebase-admin';
import { https, logger } from 'firebase-functions';
import * as Joi from 'joi';

import { CheckList, CloudFunction } from '../functionPreprocessor';

export const checkAnswersCheckList: CheckList = [
  (data) => {
    const { error } = Joi.object({
      answers: Joi.array().items(QuizeeSchemas.answerSchema).required(),
      quizId: QuizeeSchemas.quizeeInfoSchema.extract('id').disallow('').required(),
    }).validate(data);

    return {
      passed: !error,
      code: 'invalid-argument',
      message: 'Invalid input',
    };
  },
];

export const checkAnswersImplementation: CloudFunction<CheckAnswersFunction> = async (data) => {
  const userAnswers = data.answers;
  const quiz: Quiz = await admin
    .firestore()
    .doc('quizees/' + data.quizId)
    .get()
    .then((snapshot) => {
      if (!snapshot.exists) throw new https.HttpsError('invalid-argument', 'Invalid Quizee id');
      return snapshot.data() as Quiz;
    });

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
      logger.error('Invalid question type');
      return acc;
    }

    logger.debug(index, questionType, actualAnswer);
    const handler = checkCases[questionType];

    acc += factor * handler(actualAnswer, userAnswers[index].answer);
    acc = +acc.toFixed(1);
    return acc;
  }, 0);

  return result;
};
