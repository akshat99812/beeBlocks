// The hour's quote, from the idle-launch mod: shown as a still panel in the side pane.

const HOUR_MS = 3_600_000

const QUOTES = [
  ['The only way to do great work is to love what you do.', 'Steve Jobs'],
  ['We are what we repeatedly do. Excellence is a habit, not an act.', 'Will Durant'],
  ['He who has a why to live can bear almost any how.', 'Friedrich Nietzsche'],
  ['You have power over your mind, not outside events. Realize this, and you will find strength.', 'Marcus Aurelius'],
  ['It is not that we have a short time to live, but that we waste much of it.', 'Seneca'],
  ['Well begun is half done.', 'Aristotle'],
  ['The impediment to action advances action. What stands in the way becomes the way.', 'Marcus Aurelius'],
  ['Imagination is more important than knowledge.', 'Albert Einstein'],
  ['What we think, we become.', 'Buddha'],
  ['Whether you think you can, or you think you can’t, you’re right.', 'Henry Ford'],
  ['The journey of a thousand miles begins with a single step.', 'Lao Tzu'],
  ['Quality is not an act, it is a habit.', 'Aristotle'],
  ['Action is the foundational key to all success.', 'Pablo Picasso'],
  ['If I have seen further, it is by standing on the shoulders of giants.', 'Isaac Newton'],
  ['Nothing in life is to be feared, it is only to be understood.', 'Marie Curie'],
  ['The mind is everything. What you think you become.', 'Buddha'],
  ['Do what you can, with what you have, where you are.', 'Theodore Roosevelt'],
  ['Make no little plans; they have no magic to stir men’s blood.', 'Daniel Burnham'],
  ['The best way to predict the future is to invent it.', 'Alan Kay'],
  ['Start where you are. Use what you have. Do what you can.', 'Arthur Ashe'],
  ['Our greatest glory is not in never falling, but in rising every time we fall.', 'Confucius'],
  ['Simplicity is the ultimate sophistication.', 'Leonardo da Vinci'],
  ['Genius is one percent inspiration and ninety-nine percent perspiration.', 'Thomas Edison'],
  ['Courage is resistance to fear, mastery of fear, not absence of fear.', 'Mark Twain'],
] as const

export const quoteForHour = (nowMs: number): readonly [string, string] =>
  QUOTES[Math.floor(nowMs / HOUR_MS) % QUOTES.length] ?? QUOTES[0]
