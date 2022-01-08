const functions = require('firebase-functions')

const admin = require('firebase-admin')
admin.initializeApp()

exports.getQuizeesList = functions.https.onCall(async (_, context) => {
  // {
  //     caption,
  //     img,
  //     questionsCount,
  //     quizeeId
  // }

  if (context.app == undefined) {
    throw new functions.https.HttpsError(
      'failed-precondition',
      'The function must be called from an App Check verified app.'
    )
  }

  let dbData = {}

  await admin
    .database()
    .ref('quizees')
    .limitToFirst(50)
    .once('value', snapshot => (dbData = snapshot.val()))

  const responseData = Object.keys(dbData).map(quizeeId => ({
    caption: dbData[quizeeId].content.caption,
    img: dbData[quizeeId].content.img || '',
    questionsCount: dbData[quizeeId].content.questions.length,
    id: quizeeId,
  }))

  return responseData
})

exports.checkAnswers = functions.https.onCall(async (data, context) => {
  if (context.app == undefined) {
    throw new functions.https.HttpsError(
      'failed-precondition',
      'The function must be called from an App Check verified app.'
    )
  }

  const userAnswers = data.answers
  let rightAnswers = {}
  await admin
    .database()
    .ref('quizees/' + data.quizeeId + '/answers')
    .once('value', snapshot => (rightAnswers = snapshot.val()))

  const checkCases = {
    array: (answerObject, userAnswers) => {
      const factor = 1 / answerObject.answer.length
      const result = userAnswers.reduce((acc, val) => {
        if (answerObject.answer.includes(val)) acc += factor
        else acc -= factor
        return acc
      }, 0)

      return result > 0 ? result : 0
    },
    number: (rightAnswer, userAnswer) => rightAnswer.answer === userAnswer,
    string: (answerObject, userAnswer) => {
      const config = {
        equalCase: false,
        ...answerObject.config,
      }
      if (!config.equalCase) {
        userAnswer = userAnswer.toUpperCase()
        answerObject.answer = answerObject.answer.toUpperCase()
      }

      return answerObject.answer == userAnswer
    },
  }

  const getType = v => (Array.isArray(v) ? 'array' : typeof v)

  if (userAnswers.length != rightAnswers.length) throw new Error("Answers count don't equal")
  const factor = 100 / rightAnswers.length
  const result = rightAnswers.reduce((acc, value, index) => {
    console.log(index, getType(value.answer), value)
    const handler = checkCases[getType(value.answer)]

    acc += factor * handler(value, userAnswers[index])
    acc = parseFloat(acc.toFixed(1))
    return acc
  }, 0)

  return result
})
