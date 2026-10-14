const { parseCsv, toCsv } = require('../src/utils/csv');

describe('parseCsv', () => {
  it('reads plain rows with LF, CRLF and a trailing newline', () => {
    expect(parseCsv('a,b\n1,2\r\n3,4\n')).toEqual([['a', 'b'], ['1', '2'], ['3', '4']]);
  });

  it('handles quotes, doubled quotes, commas and newlines inside cells', () => {
    expect(parseCsv('"a, b","say ""hi""","line1\nline2"\n')).toEqual([['a, b', 'say "hi"', 'line1\nline2']]);
  });

  it('keeps empty cells and strips an Excel BOM', () => {
    expect(parseCsv('\uFEFFa,,c\n,,\n')).toEqual([['a', '', 'c'], ['', '', '']]);
  });

  it('rejects an unclosed quote', () => {
    expect(() => parseCsv('a,"b\n1,2')).toThrow(/unclosed quote/);
  });

  it('round-trips awkward values', () => {
    const rows = [['name', 'note'], ['Kurta, "XL"', 'two\nlines'], ['اردو', '']];
    expect(parseCsv(toCsv(rows))).toEqual(rows);
  });
});

describe('toCsv', () => {
  it('neutralises spreadsheet formulas in text cells', () => {
    const out = toCsv([['=HYPERLINK("x")', '+1', '-2', '@SUM(A1)', 'safe']]);
    expect(out).toBe(`"'=HYPERLINK(""x"")",'+1,'-2,'@SUM(A1),safe`);
  });

  it('leaves real numbers alone, including negatives, and blanks null', () => {
    expect(toCsv([[-5, 0, null, undefined, 12.5]])).toBe('-5,0,,,12.5');
  });
});
