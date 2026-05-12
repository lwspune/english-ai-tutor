import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import SessionReport from './SessionReport'

const mockNavigate = vi.fn()
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  useParams: () => ({ sessionId: 'session-1' }),
  Link: ({ to, children, ...rest }) => (
    <a href={typeof to === 'string' ? to : '#'} {...rest}>{children}</a>
  ),
}))

const BASE_SESSION = {
  id: 'session-1',
  student_id: 'student-1',
  passage_id: 'passage-1',
  score_accuracy: 78,
  score_wpm: 145,
  score_phrasing: 65,
  score_comprehension: null,
  count_omissions: 3,
  count_substitutions: 2,
  word_results: [
    { word: 'Hello', status: 'correct' },
    { word: 'world', status: 'omission' },
  ],
  feedback: null,
  comprehension_answers: null,
  created_at: new Date(2026, 3, 15).toISOString(),
  passages: { title: 'Test Passage', content: 'Hello world.' },
}

const QUESTION = {
  id: 'q1',
  passage_id: 'passage-1',
  question_text: 'What is the main idea?',
  options: ['Option A', 'Option B', 'Option C', 'Option D'],
  correct_index: 0,
  display_order: 1,
}

const { sessionRef, prevSessionsRef, recentSessionsRef, drillAttemptsRef, questionsRef, profileRef, vocabRef, progressRef, updateCalls, rpcCalls, rpcMock, mockFeedback, mockAwardMilestone } = vi.hoisted(() => ({
  sessionRef: { data: null },
  prevSessionsRef: { data: [] },
  recentSessionsRef: { data: [] },
  drillAttemptsRef: { data: [] },
  questionsRef: { data: [] },
  profileRef: { data: { grade: 10 } },
  vocabRef: { data: [] },
  progressRef: { data: [] },
  updateCalls: { value: [] },
  rpcCalls: { value: [] },
  rpcMock: (...args) => {
    rpcCalls.value.push(args)
    if (args[0] === 'get_questions_for_session') {
      return Promise.resolve({ data: questionsRef.data, error: null })
    }
    return Promise.resolve({ data: {}, error: null })
  },
  mockFeedback: vi.fn(),
  mockAwardMilestone: vi.fn(() => Promise.resolve('milestone-id')),
}))

vi.mock('../../lib/feedback', () => ({
  feedback: (...args) => mockFeedback(...args),
  prefersReducedMotion: () => false,
}))

vi.mock('../../lib/milestones', () => ({
  awardMilestone: (...args) => mockAwardMilestone(...args),
  MILESTONE_KIND: {
    PERSONAL_BEST_ACCURACY: 'personal_best_accuracy',
    PERSONAL_BEST_WPM: 'personal_best_wpm',
    COMPREHENSION_ACED: 'comprehension_aced',
  },
}))

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: (table) => {
      if (table === 'sessions') {
        return {
          select: (fields) => {
            if (fields && fields.includes('passages')) {
              return { eq: () => ({ single: () => Promise.resolve({ data: sessionRef.data }) }) }
            }
            if (fields && fields.includes('word_results')) {
              return {
                eq: () => ({
                  lte: () => ({
                    order: () => ({
                      limit: () => Promise.resolve({ data: recentSessionsRef.data }),
                    }),
                  }),
                }),
              }
            }
            return {
              eq: () => ({
                eq: () => ({
                  neq: () => Promise.resolve({ data: prevSessionsRef.data }),
                }),
              }),
            }
          },
          update: (payload) => ({
            eq: () => {
              updateCalls.value.push(payload)
              return Promise.resolve({ error: null })
            },
          }),
        }
      }
      if (table === 'profiles') {
        return {
          select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: profileRef.data }) }) }),
        }
      }
      if (table === 'questions') {
        return {
          select: () => ({ eq: () => ({ order: () => Promise.resolve({ data: questionsRef.data }) }) }),
        }
      }
      if (table === 'vocabulary_words') {
        return {
          select: () => Promise.resolve({ data: vocabRef.data }),
        }
      }
      if (table === 'student_word_progress') {
        return {
          select: () => ({ eq: () => Promise.resolve({ data: progressRef.data }) }),
        }
      }
      if (table === 'drill_attempts') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => Promise.resolve({ data: drillAttemptsRef.data }),
            }),
          }),
        }
      }
      return {}
    },
    rpc: (...args) => rpcMock(...args),
  },
}))

beforeEach(() => {
  mockNavigate.mockReset()
  sessionRef.data = { ...BASE_SESSION }
  prevSessionsRef.data = []
  recentSessionsRef.data = []
  drillAttemptsRef.data = []
  questionsRef.data = []
  profileRef.data = { grade: 10 }
  vocabRef.data = []
  progressRef.data = []
  updateCalls.value = []
  rpcCalls.value = []
  mockFeedback.mockClear()
  mockAwardMilestone.mockClear()
  mockAwardMilestone.mockResolvedValue('milestone-id')
})

// ─── Scores ───────────────────────────────────────────────────────────────────

describe('SessionReport — scores', () => {
  it('shows accuracy score', async () => {
    render(<SessionReport />)
    await waitFor(() => screen.getByText('78%'))
  })

  it('shows passage title', async () => {
    render(<SessionReport />)
    await waitFor(() => screen.getByText('Test Passage'))
  })

  it('shows WPM score', async () => {
    render(<SessionReport />)
    await waitFor(() => screen.getByText('145'))
  })

  it('shows phrasing score', async () => {
    render(<SessionReport />)
    await waitFor(() => screen.getByText('65%'))
  })

  it('shows comprehension score when present', async () => {
    sessionRef.data = { ...BASE_SESSION, score_comprehension: 75 }
    render(<SessionReport />)
    await waitFor(() => screen.getByText('75%'))
  })
})

// ─── Personal best ────────────────────────────────────────────────────────────

describe('SessionReport — personal best', () => {
  it('shows personal best banner when accuracy is a new record', async () => {
    prevSessionsRef.data = [{ score_accuracy: 70, score_wpm: 130 }]
    render(<SessionReport />)
    await waitFor(() => screen.getByText(/new personal best/i))
  })

  it('does not show personal best banner on the first attempt', async () => {
    prevSessionsRef.data = []
    render(<SessionReport />)
    await waitFor(() => screen.getByText('Test Passage'))
    expect(screen.queryByText(/new personal best/i)).not.toBeInTheDocument()
  })

  it('shows previous best when no new record', async () => {
    prevSessionsRef.data = [{ score_accuracy: 85, score_wpm: 155 }]
    render(<SessionReport />)
    await waitFor(() => screen.getByText(/best/i))
    expect(screen.getByText(/85%/)).toBeInTheDocument()
  })
})

// ─── Comprehension ────────────────────────────────────────────────────────────

describe('SessionReport — comprehension', () => {
  it('shows comprehension CTA when questions exist and not yet answered', async () => {
    questionsRef.data = [QUESTION]
    render(<SessionReport />)
    await waitFor(() => screen.getByRole('button', { name: /comprehension/i }))
  })

  it('does not show comprehension CTA when already answered', async () => {
    questionsRef.data = [QUESTION]
    sessionRef.data = {
      ...BASE_SESSION,
      comprehension_answers: [{ question_id: 'q1', selected_index: 0, is_correct: true }],
      score_comprehension: 100,
    }
    render(<SessionReport />)
    await waitFor(() => screen.getByText('Test Passage'))
    expect(screen.queryByRole('button', { name: /comprehension/i })).not.toBeInTheDocument()
  })

  it('shows comprehension results when already answered', async () => {
    questionsRef.data = [QUESTION]
    sessionRef.data = {
      ...BASE_SESSION,
      comprehension_answers: [{ question_id: 'q1', selected_index: 0, is_correct: true }],
      score_comprehension: 100,
    }
    render(<SessionReport />)
    await waitFor(() => screen.getByText('What is the main idea?'))
  })
})

// ─── AI feedback ──────────────────────────────────────────────────────────────

describe('SessionReport — feedback', () => {
  it('shows wentWell and focusOn from AI feedback', async () => {
    sessionRef.data = {
      ...BASE_SESSION,
      feedback: JSON.stringify({
        wentWell: 'Good pacing throughout.',
        focusOn: 'Work on pausing at commas.',
        practiseWords: ['therefore'],
        tip: 'Take a breath at punctuation marks.',
      }),
    }
    render(<SessionReport />)
    await waitFor(() => screen.getByText('Good pacing throughout.'))
    expect(screen.getByText('Work on pausing at commas.')).toBeInTheDocument()
  })

  it('shows plain text feedback when not JSON', async () => {
    sessionRef.data = { ...BASE_SESSION, feedback: 'Keep practising your phrasing.' }
    render(<SessionReport />)
    await waitFor(() => screen.getByText('Keep practising your phrasing.'))
  })
})

// ─── Vocab highlight + tap-to-define (v2.1) ────────────────────────────────

describe('SessionReport — vocab highlight', () => {
  const VOCAB = {
    word: 'World',
    part_of_speech: 'noun',
    definition: 'The earth, together with all of its peoples and natural features.',
    example_sentence: 'They travelled around the world.',
  }

  it('highlights vocab words for grade 10 students (ungated)', async () => {
    profileRef.data = { grade: '10' }
    vocabRef.data = [VOCAB]
    render(<SessionReport />)
    await waitFor(() => expect(screen.getByTestId('vocab-word-world')).toBeInTheDocument())
  })

  it('highlights vocab words for grade 9 students (ungated)', async () => {
    profileRef.data = { grade: '9' }
    vocabRef.data = [VOCAB]
    render(<SessionReport />)
    await waitFor(() => expect(screen.getByTestId('vocab-word-world')).toBeInTheDocument())
  })

  it('highlights matching vocab words for grade 11 students', async () => {
    profileRef.data = { grade: '11' }
    vocabRef.data = [VOCAB]
    render(<SessionReport />)
    await waitFor(() => expect(screen.getByTestId('vocab-word-world')).toBeInTheDocument())
  })

  it('highlights for grade 12 and MBA students too', async () => {
    profileRef.data = { grade: 'MBA' }
    vocabRef.data = [VOCAB]
    render(<SessionReport />)
    await waitFor(() => expect(screen.getByTestId('vocab-word-world')).toBeInTheDocument())
  })

  it('tapping a vocab word opens the definition sheet', async () => {
    const user = (await import('@testing-library/user-event')).default.setup()
    profileRef.data = { grade: '12' }
    vocabRef.data = [VOCAB]
    render(<SessionReport />)
    await waitFor(() => screen.getByTestId('vocab-word-world'))
    await user.click(screen.getByTestId('vocab-word-world'))
    expect(screen.getByText(VOCAB.definition)).toBeInTheDocument()
    // Example sentence is wrapped in quotes for styling; match the inner text
    expect(screen.getByText(new RegExp(VOCAB.example_sentence.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))).toBeInTheDocument()
  })

  it('sheet shows part-of-speech and the word', async () => {
    const user = (await import('@testing-library/user-event')).default.setup()
    profileRef.data = { grade: '11' }
    vocabRef.data = [VOCAB]
    render(<SessionReport />)
    await waitFor(() => screen.getByTestId('vocab-word-world'))
    await user.click(screen.getByTestId('vocab-word-world'))
    expect(screen.getByRole('heading', { name: 'World' })).toBeInTheDocument()
    expect(screen.getByText(/noun/i)).toBeInTheDocument()
  })

  it('sheet closes on close button click', async () => {
    const user = (await import('@testing-library/user-event')).default.setup()
    profileRef.data = { grade: '11' }
    vocabRef.data = [VOCAB]
    render(<SessionReport />)
    await waitFor(() => screen.getByTestId('vocab-word-world'))
    await user.click(screen.getByTestId('vocab-word-world'))
    expect(screen.getByText(VOCAB.definition)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /close/i }))
    expect(screen.queryByText(VOCAB.definition)).not.toBeInTheDocument()
  })

  it('non-vocab words have no vocab testid', async () => {
    profileRef.data = { grade: '11' }
    vocabRef.data = [VOCAB] // only "world"; "Hello" is not vocab
    render(<SessionReport />)
    await waitFor(() => screen.getByText('Hello'))
    expect(screen.queryByTestId('vocab-word-hello')).not.toBeInTheDocument()
  })
})

// ─── Vocab retention quiz (v2 F3) ──────────────────────────────────────────

describe('SessionReport — vocab retention quiz', () => {
  const ABANDON = {
    id: 'w1', word: 'Abandon', part_of_speech: 'verb',
    definition: 'To give up.', example_sentence: 'They abandoned the plan.',
    synonyms: ['forsake', 'desert'], antonyms: ['keep', 'retain'],
  }
  const BRISK = {
    id: 'w2', word: 'Brisk', part_of_speech: 'adjective',
    definition: 'Quick.', example_sentence: 'A brisk walk.',
    synonyms: ['quick', 'lively'], antonyms: ['slow', 'sluggish'],
  }

  it('renders for grade 9/10 students too (ungated)', async () => {
    profileRef.data = { grade: '10' }
    vocabRef.data = [ABANDON, BRISK]
    sessionRef.data = { ...BASE_SESSION, word_results: [{ word: 'Abandon', status: 'correct' }] }
    render(<SessionReport />)
    await waitFor(() => expect(screen.getByTestId('retention-quiz')).toBeInTheDocument())
  })

  it('is hidden when no vocab words match the passage', async () => {
    profileRef.data = { grade: '11' }
    vocabRef.data = [ABANDON]
    sessionRef.data = { ...BASE_SESSION, word_results: [{ word: 'unrelated', status: 'correct' }] }
    render(<SessionReport />)
    await waitFor(() => screen.getByText('unrelated'))
    expect(screen.queryByTestId('retention-quiz')).not.toBeInTheDocument()
  })

  it('is hidden when session.vocab_retention_answers is already populated', async () => {
    profileRef.data = { grade: '11' }
    vocabRef.data = [ABANDON]
    sessionRef.data = {
      ...BASE_SESSION,
      word_results: [{ word: 'Abandon', status: 'correct' }],
      vocab_retention_answers: [{ word_id: 'w1', selected_index: 0, was_correct: true }],
    }
    render(<SessionReport />)
    await waitFor(() => screen.getByText('Abandon'))
    expect(screen.queryByTestId('retention-quiz')).not.toBeInTheDocument()
  })

  it('renders the quiz when conditions are right', async () => {
    profileRef.data = { grade: '11' }
    vocabRef.data = [ABANDON, BRISK]
    sessionRef.data = { ...BASE_SESSION, word_results: [{ word: 'Abandon', status: 'correct' }] }
    render(<SessionReport />)
    await waitFor(() => expect(screen.getByTestId('retention-quiz')).toBeInTheDocument())
    expect(screen.getByRole('heading', { name: 'Abandon' })).toBeInTheDocument()
  })

  it('Skip button dismisses the quiz section', async () => {
    const user = (await import('@testing-library/user-event')).default.setup()
    profileRef.data = { grade: '11' }
    vocabRef.data = [ABANDON, BRISK]
    sessionRef.data = { ...BASE_SESSION, word_results: [{ word: 'Abandon', status: 'correct' }] }
    render(<SessionReport />)
    await waitFor(() => screen.getByTestId('retention-quiz'))
    await user.click(screen.getByRole('button', { name: /^skip$/i }))
    expect(screen.queryByTestId('retention-quiz')).not.toBeInTheDocument()
  })

  it('persists retention answers via save_vocab_retention_answers RPC (not direct UPDATE)', async () => {
    const user = (await import('@testing-library/user-event')).default.setup()
    const realRandom = Math.random
    Math.random = () => 0.5
    profileRef.data = { grade: '11' }
    // single-word passage so we only have one card to answer (passage word_count < 100)
    vocabRef.data = [ABANDON, BRISK]
    sessionRef.data = {
      ...BASE_SESSION,
      passages: { title: 'Test Passage', content: 'Abandon.' },
      word_results: [{ word: 'Abandon', status: 'correct' }],
    }
    render(<SessionReport />)
    await waitFor(() => screen.getByTestId('retention-quiz'))
    // Pick any option to answer; quiz advances to Done
    await user.click(screen.getByRole('button', { name: /^forsake$/i }))
    await user.click(screen.getByRole('button', { name: /^done$/i }))
    // Verify the new RPC was called, and no direct UPDATE happened
    await waitFor(() => {
      expect(rpcCalls.value.some(([fn]) => fn === 'save_vocab_retention_answers')).toBe(true)
    })
    expect(updateCalls.value.some(p => Object.prototype.hasOwnProperty.call(p, 'vocab_retention_answers'))).toBe(false)
    Math.random = realRandom
  })

  it('fires feedback("correct") on a correct retention answer', async () => {
    const user = (await import('@testing-library/user-event')).default.setup()
    profileRef.data = { grade: '11' }
    vocabRef.data = [ABANDON, BRISK]
    sessionRef.data = { ...BASE_SESSION, word_results: [{ word: 'Abandon', status: 'correct' }] }
    // Lock RNG so the correct option (synonym 'forsake') is at a predictable index
    const realRandom = Math.random
    Math.random = () => 0.5
    render(<SessionReport />)
    await waitFor(() => screen.getByTestId('retention-quiz'))
    const correct = screen.getByRole('button', { name: /^forsake$/i })
    await user.click(correct)
    expect(mockFeedback).toHaveBeenCalledWith('correct')
    Math.random = realRandom
  })

  it('fires feedback("wrong") on an incorrect retention answer', async () => {
    const user = (await import('@testing-library/user-event')).default.setup()
    profileRef.data = { grade: '11' }
    vocabRef.data = [ABANDON, BRISK]
    sessionRef.data = { ...BASE_SESSION, word_results: [{ word: 'Abandon', status: 'correct' }] }
    const realRandom = Math.random
    Math.random = () => 0.5
    render(<SessionReport />)
    await waitFor(() => screen.getByTestId('retention-quiz'))
    // Scope to retention quiz card; pick any option that is NOT a synonym of "Abandon"
    const quiz = screen.getByTestId('retention-quiz')
    const ABANDON_SYNS = ['forsake', 'desert']
    const optionButtons = within(quiz)
      .getAllByRole('button')
      .filter((b) => !/^skip$/i.test(b.textContent.trim()))
    const wrongOption = optionButtons.find(
      (b) => !ABANDON_SYNS.includes(b.textContent.trim().toLowerCase()),
    )
    await user.click(wrongOption)
    expect(mockFeedback).toHaveBeenCalledWith('wrong')
    Math.random = realRandom
  })
})

// ─── Confetti celebrations ────────────────────────────────────────────────────

describe('SessionReport — celebrations', () => {
  it('shows confetti when personal best banner appears', async () => {
    prevSessionsRef.data = [{ score_accuracy: 70, score_wpm: 130 }]
    render(<SessionReport />)
    await waitFor(() => screen.getByText(/new personal best/i))
    await waitFor(() => expect(screen.getByTestId('confetti')).toBeInTheDocument())
  })

  it('does NOT show confetti when there is no personal best', async () => {
    prevSessionsRef.data = [{ score_accuracy: 95, score_wpm: 200 }]
    render(<SessionReport />)
    await waitFor(() => screen.getByText('Test Passage'))
    expect(screen.queryByTestId('confetti')).not.toBeInTheDocument()
  })

  it('shows confetti when comprehension score is ≥80%', async () => {
    sessionRef.data = {
      ...BASE_SESSION,
      score_comprehension: 100,
      comprehension_answers: [{ question_id: 'q1', selected_index: 0, is_correct: true }],
    }
    questionsRef.data = [QUESTION]
    render(<SessionReport />)
    await waitFor(() => screen.getByText('100%'))
    await waitFor(() => expect(screen.getByTestId('confetti')).toBeInTheDocument())
  })

  it('does NOT show confetti when comprehension is below 80%', async () => {
    sessionRef.data = {
      ...BASE_SESSION,
      score_comprehension: 50,
      comprehension_answers: [{ question_id: 'q1', selected_index: 1, is_correct: false }],
    }
    questionsRef.data = [QUESTION]
    render(<SessionReport />)
    await waitFor(() => screen.getByText('50%'))
    expect(screen.queryByTestId('confetti')).not.toBeInTheDocument()
  })

  it('fires feedback("celebrate") on a celebrated session', async () => {
    prevSessionsRef.data = [{ score_accuracy: 70, score_wpm: 130 }]
    render(<SessionReport />)
    await waitFor(() => screen.getByText(/new personal best/i))
    expect(mockFeedback).toHaveBeenCalledWith('celebrate')
  })

  it('does NOT fire feedback("celebrate") on a non-celebrated session', async () => {
    prevSessionsRef.data = [{ score_accuracy: 95, score_wpm: 200 }]
    render(<SessionReport />)
    await waitFor(() => screen.getByText('Test Passage'))
    expect(mockFeedback).not.toHaveBeenCalledWith('celebrate')
  })

  it('awards personal_best_accuracy milestone when accuracy is a new record', async () => {
    prevSessionsRef.data = [{ score_accuracy: 70, score_wpm: 200 }]
    render(<SessionReport />)
    await waitFor(() => screen.getByText(/new personal best/i))
    await waitFor(() => expect(mockAwardMilestone).toHaveBeenCalledWith('personal_best_accuracy', { session_id: 'session-1' }))
  })

  it('awards personal_best_wpm milestone when WPM is a new record', async () => {
    prevSessionsRef.data = [{ score_accuracy: 95, score_wpm: 130 }]
    render(<SessionReport />)
    await waitFor(() => screen.getByText(/new personal best/i))
    await waitFor(() => expect(mockAwardMilestone).toHaveBeenCalledWith('personal_best_wpm', { session_id: 'session-1' }))
  })

  it('awards comprehension_aced milestone when score is >=80', async () => {
    sessionRef.data = {
      ...BASE_SESSION,
      score_comprehension: 90,
      comprehension_answers: [{ question_id: 'q1', selected_index: 0, is_correct: true }],
    }
    questionsRef.data = [QUESTION]
    render(<SessionReport />)
    await waitFor(() => screen.getByText('90%'))
    await waitFor(() => expect(mockAwardMilestone).toHaveBeenCalledWith('comprehension_aced', { session_id: 'session-1' }))
  })

  it('does NOT award any milestone on a vanilla session', async () => {
    prevSessionsRef.data = [{ score_accuracy: 95, score_wpm: 200 }]
    render(<SessionReport />)
    await waitFor(() => screen.getByText('Test Passage'))
    expect(mockAwardMilestone).not.toHaveBeenCalled()
  })
})

// ─── Stumble drill card integration ───────────────────────────────────────────

describe('SessionReport — stumble drill card', () => {
  it('renders Practise card chips from recent stumble words', async () => {
    recentSessionsRef.data = [
      {
        id: 'session-1',
        word_results: [
          { word: 'fraudulent', status: 'substitution' },
          { word: 'discriminate', status: 'omission' },
        ],
      },
    ]
    render(<SessionReport />)
    await waitFor(() => screen.getByText('Practise these words'))
    expect(screen.getByRole('link', { name: /fraudulent/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /discriminate/i })).toBeInTheDocument()
  })

  it('does NOT render the drill card when there are no stumble words', async () => {
    recentSessionsRef.data = [
      { id: 'session-1', word_results: [{ word: 'hello', status: 'correct' }] },
    ]
    render(<SessionReport />)
    await waitFor(() => screen.getByText('Test Passage'))
    expect(screen.queryByText('Practise these words')).not.toBeInTheDocument()
  })

  it('awards drill_session_aced milestone when 3 distinct stumble words have correct drill attempts', async () => {
    drillAttemptsRef.data = [
      { stumble_word: 'fraudulent' },
      { stumble_word: 'discriminate' },
      { stumble_word: 'amplify' },
    ]
    render(<SessionReport />)
    await waitFor(() =>
      expect(mockAwardMilestone).toHaveBeenCalledWith('drill_session_aced', { session_id: 'session-1' }),
    )
  })

  it('does NOT award drill_session_aced when only 2 distinct words are correct', async () => {
    drillAttemptsRef.data = [
      { stumble_word: 'fraudulent' },
      { stumble_word: 'discriminate' },
    ]
    render(<SessionReport />)
    await waitFor(() => screen.getByText('Test Passage'))
    expect(mockAwardMilestone).not.toHaveBeenCalledWith(
      'drill_session_aced',
      expect.anything(),
    )
  })

  it('counts distinct stumble words case-insensitively for drill ace detection', async () => {
    drillAttemptsRef.data = [
      { stumble_word: 'Fraudulent' },
      { stumble_word: 'fraudulent' },
      { stumble_word: 'discriminate' },
    ]
    render(<SessionReport />)
    await waitFor(() => screen.getByText('Test Passage'))
    // Only 2 distinct lowercased: fraudulent, discriminate → no ace
    expect(mockAwardMilestone).not.toHaveBeenCalledWith(
      'drill_session_aced',
      expect.anything(),
    )
  })
})
