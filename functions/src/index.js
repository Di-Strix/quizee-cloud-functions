const functions = require('firebase-functions')

const admin = require('firebase-admin')
const { user } = require('firebase-functions/lib/providers/auth')
admin.initializeApp()

exports.getQuizeesList = functions.https.onRequest(async (_, res) => {
  // {
  //     caption,
  //     img,
  //     questionsCount,
  //     quizeeId
  // }
  res.set('Access-Control-Allow-Origin', '*')
  res.set('Access-Control-Allow-Methods', 'GET, POST')
  try {
    let data = {}

    await admin
      .database()
      .ref('quizees')
      .limitToFirst(50)
      .once('value', snapshot => (data = snapshot.val()))
    const responseData = Object.keys(data).map(quizeeId => ({
      caption: data[quizeeId].content.caption,
      img: data[quizeeId].content.img || '',
      questionsCount: data[quizeeId].content.questions.length,
      id: quizeeId,
    }))
    res.json({ ok: true, message: responseData })
  } catch (e) {
    res.json({ ok: false, message: e.message })
  }
})

exports.checkAnswers = functions.https.onRequest(async ({ query }, res) => {
  res.set('Access-Control-Allow-Origin', '*')
  res.set('Access-Control-Allow-Methods', 'GET, POST')

  const inputData = JSON.parse(query.data)
  const userAnswers = inputData.answers
  let rightAnswers = {}
  await admin
    .database()
    .ref('quizees/' + inputData.quizeeId + '/answers')
    .once('value', snapshot => (rightAnswers = snapshot.val()))

  const checkCases = {
    array: (answerObject, userAnswers) => {
      const factor = 1 / answerObject.answer.length
      return userAnswers.reduce((acc, val) => {
        if (answerObject.answer.includes(val)) acc += factor
        else acc -= factor
        return acc
      }, 0)
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

  try {
    if (userAnswers.length != rightAnswers.length)
      throw new Error('Answers count dont equal')
    const factor = 100 / rightAnswers.length
    const result = rightAnswers.reduce((acc, value, index) => {
      console.log(index, getType(value.answer), value)
      const handler = checkCases[getType(value.answer)]

      acc += factor * handler(value, userAnswers[index])
      acc = parseFloat(acc.toFixed(1))
      console.log(result)
      return acc
    }, 0)
    res.json({ ok: true, message: result })
  } catch (e) {
    res.json({ ok: false, message: e.message })
  }
})
// // Create and Deploy Your First Cloud Functions
// // https://firebase.google.com/docs/functions/write-firebase-functions
//
// exports.helloWorld = functions.https.onRequest((request, response) => {
//   functions.logger.info("Hello logs!", {structuredData: true});
//   response.send("Hello from Firebase!");
// });
