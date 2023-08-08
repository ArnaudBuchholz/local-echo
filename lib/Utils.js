import { parse } from "shell-quote";

/**
 * Removes the ANSI escape codes from the given input
 */
export function removeANSI(input) {
  return input.replace(/\x1B\[([0-9]{1,2}(;[0-9]{1,2})?)?[m|K]/g, '')
}

/**
 * Detects all the word boundaries on the given input
 */
export function wordBoundaries(input, leftSide = true) {
  let match;
  const words = [];
  const rx = /\w+/g;

  while ((match = rx.exec(input))) {
    if (leftSide) {
      words.push(match.index);
    } else {
      words.push(match.index + match[0].length);
    }
  }

  return words;
}

/**
 * The closest left (or right) word boundary of the given input at the
 * given offset.
 */
export function closestLeftBoundary(input, offset) {
  const found = wordBoundaries(input, true)
    .reverse()
    .find(x => x < offset);
  return found == null ? 0 : found;
}
export function closestRightBoundary(input, offset) {
  const found = wordBoundaries(input, false).find(x => x > offset);
  return found == null ? input.length : found;
}

/**
 * Returns the word at the given offset.
 */
export function calcWidth(str) {
  let acc= 0;
  for (let i = 0; i < str.length; ++i) {
    const c = str.charAt(i);
    // Zero width
    if(/[\u200B-\u200D\uFEFF]/g.test(c)) {
      acc += 0;
    }
    // Special characters
    else if(/[\u0591-\u05F4\uFB1D-\uFBF4]/g.test(c)) {
      acc += 0;
    }
    // Wide characters
    else if(/[\u1100-\u115F\u11A3-\u11A7\u11FA-\u11FF\u2329-\u232A\u2E80-\u2E99\u2E9B-\u2EF3\u2F00-\u2FD5\u2FF0-\u2FFB\u3000-\u303E\u3041-\u3096\u3099-\u30FF\u3105-\u312F\u3131-\u318E\u3190-\u31BA\u31C0-\u31E3\u31F0-\u31FF\u3200-\u321E\u3220-\u3247\u3250-\u32FE\u3300-\u33FF\u3400-\u4DBF\u4E00-\u9FFC\uA000-\uA48C\uA490-\uA4C6\uA960-\uA97C\uAC00-\uD7A3\uF900-\uFA6D\uFA70-\uFAD9\uFE10-\uFE19\uFE30-\uFE52\uFE54-\uFE66\uFE68-\uFE6B\uFF01-\uFF60\uFFE0-\uFFE6]/g.test(c)) {
      acc += 2;
    }
    // Combining characters
    else acc += 1;
  }
  return acc;
}

/**
 * Convert offset at the given input to col/row location
 *
 * This function is not optimized and practically emulates via brute-force
 * the navigation on the terminal, wrapping when they reach the column width.
 */
export function offsetToColRow(input, offset, maxCols) {
  let ansi_input = input
  input = removeANSI(input)
  offset -= (ansi_input.length - input.length)
  
  let row = 0,
    col = 0;

  for (let i = 0; i < offset; ++i) {
    const chr = input.charAt(i);
    if (chr == "\n") {
      col = 0;
      row += 1;
    } else {
      col += calcWidth(chr);
      if (col > maxCols) {
        col = 0;
        row += 1;
      }
    }
  }

  return { row, col };
}

/**
 * Counts the lines in the given input
 */
export function countLines(input, maxCols) {
  return offsetToColRow(input, input.length, maxCols).row + 1;
}

/**
 * Checks if there is an incomplete input
 *
 * An incomplete input is considered:
 * - An input that contains unterminated single quotes
 * - An input that contains unterminated double quotes
 * - An input that ends with "\"
 * - An input that has an incomplete boolean shell expression (&& and ||)
 * - An incomplete pipe expression (|)
 */
export function isIncompleteInput(input) {
  // Empty input is not incomplete
  if (input.trim() == "") {
    return false;
  }

  // Check for dangling single-quote strings
  if ((input.match(/'/g) || []).length % 2 !== 0) {
    return true;
  }
  // Check for dangling double-quote strings
  if ((input.match(/"/g) || []).length % 2 !== 0) {
    return true;
  }
  // Check for dangling boolean or pipe operations
  if (
    input
      .split(/(\|\||\||&&)/g)
      .pop()
      .trim() == ""
  ) {
    return true;
  }
  // Check for tailing slash
  if (input.endsWith("\\") && !input.endsWith("\\\\")) {
    return true;
  }

  return false;
}

/**
 * Returns true if the expression ends on a tailing whitespace
 */
export function hasTailingWhitespace(input) {
  return input.match(/[^\\][ \t]$/m) != null;
}

/**
 * Returns the last expression in the given input
 */
export function getLastToken(input) {
  // Empty expressions
  if (input.trim() === "") return "";
  if (hasTailingWhitespace(input)) return "";

  // Last token
  const tokens = parse(input);
  return tokens.pop() || "";
}

/**
 * Returns the auto-complete candidates for the given input
 */
export function collectAutocompleteCandidates(callbacks, input) {
  const tokens = parse(input);
  let index = tokens.length - 1;
  let expr = tokens[index] || "";

  // Empty expressions
  if (input.trim() === "") {
    index = 0;
    expr = "";
  } else if (hasTailingWhitespace(input)) {
    // Expressions with danging space
    index += 1;
    expr = "";
  }

  // Collect all auto-complete candidates from the callbacks
  const all = callbacks.reduce((candidates, { fn, args }) => {
    try {
      return candidates.concat(fn(index, tokens, ...args));
    } catch (e) {
      console.error("Auto-complete error:", e);
      return candidates;
    }
  }, []);

  // Filter only the ones starting with the expression
  return all.filter(txt => txt.startsWith(expr));
}


export function getSharedFragment(fragment, candidates) {

  // end loop when fragment length = first candidate length
  if (fragment.length >= candidates[0].length) return fragment;
  
  // save old fragemnt
  const oldFragment = fragment;
  
  // get new fragment
  fragment += candidates[0].slice(fragment.length, fragment.length+1);

  for (let i=0; i<candidates.length; i++ ) {

    // return null when there's a wrong candidate
    if (!candidates[i].startsWith(oldFragment)) return null;

    if (!candidates[i].startsWith(fragment)) {
      return oldFragment;
    }
  }

  return getSharedFragment(fragment, candidates);
}
