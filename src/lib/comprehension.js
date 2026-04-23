/**
 * Grade student answers against correct answers.
 * @param {Array<{id: string, correct_index: number}>} questions
 * @param {Array<{question_id: string, selected_index: number}>} answers
 * @returns {{ score: number, answers: Array<{question_id, selected_index, is_correct}> }}
 */
export function gradeAnswers(questions, answers) {
  const graded = answers.map(a => {
    const q = questions.find(q => q.id === a.question_id)
    return {
      question_id: a.question_id,
      selected_index: a.selected_index,
      is_correct: q ? a.selected_index === q.correct_index : false,
    }
  })
  const correct = graded.filter(a => a.is_correct).length
  const score = Math.round((correct / questions.length) * 100)
  return { score, answers: graded }
}
