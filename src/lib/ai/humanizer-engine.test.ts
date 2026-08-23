/**
 * Banned-phrase detection for the rewrite path.
 *
 * The Brand Kit page tells creators their banned words are kept out of generated
 * drafts. This function is what makes that claim checkable: it runs on the
 * model's output, drives the single retry, and whatever it still finds is
 * surfaced to the user as `bannedRemaining` rather than quietly dropped.
 *
 * Both failure directions are real. A miss breaks the promise on the page. A
 * false positive sends a pointless retry to the model and then reports a word
 * the creator can see is not there — so "ai" must not fire on "said", and
 * "sale" must not fire on "wholesale".
 */
import { describe, it, expect } from 'vitest';
import { findBanned } from './humanizer-engine';

describe('findBanned', () => {
  it('finds a banned phrase that is present', () => {
    expect(findBanned('This is a game-changer for you', ['game-changer'])).toEqual(['game-changer']);
  });

  it('returns an empty list when nothing is banned or nothing matches', () => {
    expect(findBanned('a clean sentence', [])).toEqual([]);
    expect(findBanned('a clean sentence', ['hype', 'unlock'])).toEqual([]);
    expect(findBanned('', ['hype'])).toEqual([]);
  });

  it('matches case-insensitively, because the creator types Crypto and the model writes crypto', () => {
    expect(findBanned('crypto is volatile', ['Crypto'])).toEqual(['Crypto']);
    expect(findBanned('CRYPTO is volatile', ['crypto'])).toEqual(['crypto']);
  });

  it('returns the creator\'s own spelling, not the text\'s', () => {
    // The UI shows these back as the words the creator banned.
    expect(findBanned('this is HYPE', ['Hype'])).toEqual(['Hype']);
  });

  it('respects word boundaries so short bans do not fire on substrings', () => {
    // The canonical false positive: a banned "ai" hitting "said", "again",
    // "email". Firing here would make the feature unusable for short words.
    expect(findBanned('he said it again in an email', ['ai'])).toEqual([]);
    expect(findBanned('wholesale pricing', ['sale'])).toEqual([]);
    expect(findBanned('a classic assumption', ['ass'])).toEqual([]);
  });

  it('still matches a short ban when it stands alone as a word', () => {
    expect(findBanned('the ai wrote it', ['ai'])).toEqual(['ai']);
    expect(findBanned('a sale on now', ['sale'])).toEqual(['sale']);
  });

  it('matches a multi-word phrase', () => {
    expect(findBanned('this will change the game today', ['change the game'])).toEqual([
      'change the game',
    ]);
    expect(findBanned('this changes everything', ['change the game'])).toEqual([]);
  });

  it('finds every banned phrase present, not just the first', () => {
    const found = findBanned('a game-changer that will unlock real hype', [
      'game-changer',
      'unlock',
      'hype',
      'synergy',
    ]);
    expect(found).toEqual(['game-changer', 'unlock', 'hype']);
  });

  it('ignores blank entries in the banned list', () => {
    // A creator who leaves an empty row in the UI must not have every rewrite
    // reported as containing the empty string.
    expect(findBanned('anything at all', ['', '   ', '\t'])).toEqual([]);
    expect(findBanned('anything at all', ['', 'anything'])).toEqual(['anything']);
  });

  it('treats regex metacharacters as literal text', () => {
    // A creator can ban "C++" or "10% off". Unescaped, these are either invalid
    // regexes (crashing the rewrite) or match far more than intended.
    expect(findBanned('we cover C++ basics', ['C++'])).toEqual(['C++']);
    expect(findBanned('we cover C basics', ['C++'])).toEqual([]);
    expect(findBanned('get 10% off today', ['10% off'])).toEqual(['10% off']);
    expect(findBanned('anything goes', ['.*'])).toEqual([]);
    expect(findBanned('literally .* here', ['.*'])).toEqual(['.*']);
    expect(findBanned('a (parenthetical) aside', ['(parenthetical)'])).toEqual(['(parenthetical)']);
  });

  it('does not throw on any input a creator could plausibly type', () => {
    const nasty = ['[', '(', '\\', '*', '+?', '$', '^', '{2,}', 'a|b', 'C++', '?!'];
    for (const phrase of nasty) {
      expect(() => findBanned('some ordinary sentence', [phrase])).not.toThrow();
    }
  });

  it('anchors loosely when the phrase starts or ends with punctuation', () => {
    // \b is only meaningful next to a word character, so a phrase like "!!!"
    // must still be findable.
    expect(findBanned('wow!!! amazing', ['!!!'])).toEqual(['!!!']);
    expect(findBanned('the cost is $99 today', ['$99'])).toEqual(['$99']);
  });

  it('trims the phrase before matching, so a stray space still catches', () => {
    expect(findBanned('this is hype', [' hype '])).toEqual([' hype ']);
  });

  it('is deterministic and does not mutate its inputs', () => {
    const banned = ['hype', 'unlock'];
    const text = 'pure hype here';
    const first = findBanned(text, banned);
    const second = findBanned(text, banned);
    expect(first).toEqual(second);
    expect(banned).toEqual(['hype', 'unlock']);
  });

  it('is not confused by a previous match when scanning for the next', () => {
    // Regex lastIndex leaking between phrases would make results depend on the
    // order of the banned list.
    const forward = findBanned('hype and unlock and hype', ['hype', 'unlock']);
    const reverse = findBanned('hype and unlock and hype', ['unlock', 'hype']);
    expect(forward.sort()).toEqual(reverse.sort());
  });
});
