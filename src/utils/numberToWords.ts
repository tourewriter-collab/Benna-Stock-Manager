/**
 * Converts a number into French or English words.
 */

// French rules
const frUnits = ['', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf'];
const frTens = ['', 'dix', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante', 'soixante', 'quatre-vingt', 'quatre-vingt'];
const frExceptions: { [key: number]: string } = {
  11: 'onze',
  12: 'douze',
  13: 'treize',
  14: 'quatorze',
  15: 'quinze',
  16: 'seize',
  71: 'soixante et onze',
  72: 'soixante-douze',
  73: 'soixante-treize',
  74: 'soixante-quatorze',
  75: 'soixante-quinze',
  76: 'soixante-seize',
  91: 'quatre-vingt-onze',
  92: 'quatre-vingt-douze',
  93: 'quatre-vingt-treize',
  94: 'quatre-vingt-quatorze',
  95: 'quatre-vingt-quinze',
  96: 'quatre-vingt-seize',
};

function convertGroupFr(n: number): string {
  if (n === 0) return '';
  let result = '';

  const h = Math.floor(n / 100);
  const t = Math.floor((n % 100) / 10);
  const u = n % 10;

  if (h > 0) {
    if (h === 1) result += 'cent ';
    else result += frUnits[h] + ' cents ';
  }

  const remainder = n % 100;
  if (remainder === 0) return result.trim();

  if (frExceptions[remainder]) {
    result += frExceptions[remainder];
  } else {
    if (t === 7 || t === 9) {
      const base = t === 7 ? 'soixante' : 'quatre-vingt';
      const suffix = frExceptions[10 + u] || frUnits[10 + u];
      result += base + (u === 1 ? ' et ' : '-') + suffix;
    } else {
      if (t > 1) {
        result += frTens[t];
        if (u === 1 && t !== 8) result += ' et ' + frUnits[u];
        else if (u > 0) result += '-' + frUnits[u];
      } else if (t === 1) {
        result += frExceptions[remainder] || 'dix-' + frUnits[u];
      } else {
        result += frUnits[u];
      }
    }
  }

  return result.trim();
}

// English rules
const enUnits = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
const enTeens = ['ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const enTens = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

function convertGroupEn(n: number): string {
  if (n === 0) return '';
  let result = '';

  const h = Math.floor(n / 100);
  const t = Math.floor((n % 100) / 10);
  const u = n % 10;

  if (h > 0) {
    result += enUnits[h] + ' hundred ';
  }

  const remainder = n % 100;
  if (remainder === 0) return result.trim();

  if (h > 0) result += 'and ';

  if (t === 1) {
    result += enTeens[u];
  } else {
    if (t > 1) {
      result += enTens[t];
      if (u > 0) result += '-' + enUnits[u];
    } else {
      result += enUnits[u];
    }
  }

  return result.trim();
}

export function numberToWords(n: number, lang: string = 'fr'): string {
  if (n === 0) return lang === 'fr' ? 'ZÉRO' : 'ZERO';
  
  const labs = lang === 'fr' 
    ? { b: 'milliard', m: 'million', k: 'mille', cur: 'FRANCS GUINÉENS' }
    : { b: 'billion', m: 'million', k: 'thousand', cur: 'GUINEAN FRANCS' };

  const absN = Math.abs(n);
  const billions = Math.floor(absN / 1000000000);
  const millions = Math.floor((absN % 1000000000) / 1000000);
  const thousands = Math.floor((absN % 1000000) / 1000);
  const remainder = Math.floor(absN % 1000);

  let result = '';
  const convert = lang === 'fr' ? convertGroupFr : convertGroupEn;

  if (billions > 0) {
    if (lang === 'fr') {
      result += (billions === 1 ? 'un ' + labs.b : convert(billions) + ' ' + labs.b + 's') + ' ';
    } else {
      result += convert(billions) + ' ' + labs.b + ' ';
    }
  }

  if (millions > 0) {
    if (lang === 'fr') {
      result += (millions === 1 ? 'un ' + labs.m : convert(millions) + ' ' + labs.m + 's') + ' ';
    } else {
      result += convert(millions) + ' ' + labs.m + ' ';
    }
  }

  if (thousands > 0) {
    if (lang === 'fr') {
      if (thousands === 1) result += labs.k + ' ';
      else result += convert(thousands) + ' ' + labs.k + ' ';
    } else {
      result += convert(thousands) + ' ' + labs.k + ' ';
    }
  }

  if (remainder > 0) {
    result += convert(remainder);
  }

  return result.trim().toUpperCase() + ' ' + labs.cur + ' (GNF)';
}
