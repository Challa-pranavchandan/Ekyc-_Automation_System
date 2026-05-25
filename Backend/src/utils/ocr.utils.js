import Tesseract from 'tesseract.js';

// ─── Run OCR on image URL ─────────────────────────────────────────────────────
const runOCR = async (imageUrl) => {
  const { data } = await Tesseract.recognize(imageUrl, 'eng', {
    logger: () => {}, // silence logs
  });
  return {
    text: data.text,
    confidence: data.confidence / 100, // normalize to 0-1
  };
};

// ─── Extract Aadhaar fields ───────────────────────────────────────────────────
// Sample Aadhaar text contains: name, DOB, gender, 12-digit aadhaar number
const extractAadhaarData = (text) => {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);

  // Aadhaar number: 12 digits (may appear as XXXX XXXX XXXX)
  const aadhaarMatch = text.match(/\d{4}\s?\d{4}\s?\d{4}/);
  const idNumber = aadhaarMatch ? aadhaarMatch[0].replace(/\s/g, '') : null;

  // DOB: DD/MM/YYYY or DD-MM-YYYY
  const dobMatch = text.match(/\b(\d{2}[\/\-]\d{2}[\/\-]\d{4})\b/);
  const dob = dobMatch ? dobMatch[1] : null;

  // Gender
  const genderMatch = text.match(/\b(MALE|FEMALE|Male|Female)\b/);
  const gender = genderMatch ? genderMatch[1].toLowerCase() : null;

  // Name: usually the line before DOB or after "To" keyword
  // Heuristic: first line with only letters and spaces (2-5 words)
  let name = null;
  for (const line of lines) {
    if (
      /^[A-Za-z\s]{3,50}$/.test(line) &&
      !['GOVERNMENT', 'INDIA', 'UNIQUE', 'AUTHORITY', 'MALE', 'FEMALE'].includes(
        line.toUpperCase().trim()
      )
    ) {
      name = line.trim();
      break;
    }
  }

  return { name, dateOfBirth: dob, idNumber, gender, address: null };
};

// ─── Extract PAN fields ───────────────────────────────────────────────────────
// PAN format: ABCDE1234F
const extractPanData = (text) => {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);

  // PAN number: 10 char alphanumeric
  const panMatch = text.match(/[A-Z]{5}[0-9]{4}[A-Z]{1}/);
  const idNumber = panMatch ? panMatch[0] : null;

  // DOB: DD/MM/YYYY
  const dobMatch = text.match(/\b(\d{2}[\/\-]\d{2}[\/\-]\d{4})\b/);
  const dob = dobMatch ? dobMatch[1] : null;

  // Name: usually appears after "Name" label
  let name = null;
  const nameLineIndex = lines.findIndex((l) =>
    l.toUpperCase().includes('NAME')
  );
  if (nameLineIndex !== -1 && lines[nameLineIndex + 1]) {
    name = lines[nameLineIndex + 1].trim();
  }

  // Father name: line after name
  let fatherName = null;
  if (nameLineIndex !== -1 && lines[nameLineIndex + 2]) {
    fatherName = lines[nameLineIndex + 2].trim();
  }

  return { name, dateOfBirth: dob, idNumber, gender: null, address: null, fatherName };
};

// ─── Extract Passport fields ──────────────────────────────────────────────────
// Uses MRZ (Machine Readable Zone) at bottom of passport
const extractPassportData = (text) => {
  // MRZ line pattern: P<INDLASTNAME<<FIRSTNAME<<<...
  const mrzMatch = text.match(/P<[A-Z]{3}([A-Z<]+)/);
  let name = null;
  if (mrzMatch) {
    const namePart = mrzMatch[1].replace(/</g, ' ').trim();
    name = namePart;
  }

  // Passport number: 1 letter + 7 digits (e.g. A1234567)
  const passportMatch = text.match(/[A-Z]\d{7}/);
  const idNumber = passportMatch ? passportMatch[0] : null;

  // DOB from MRZ: YYMMDD
  const dobMrzMatch = text.match(/\d{7}<(\d{6})/);
  let dob = null;
  if (dobMrzMatch) {
    const raw = dobMrzMatch[1]; // YYMMDD
    const year = parseInt(raw.slice(0, 2));
    const month = raw.slice(2, 4);
    const day = raw.slice(4, 6);
    const fullYear = year > 30 ? `19${year}` : `20${String(year).padStart(2, '0')}`;
    dob = `${day}/${month}/${fullYear}`;
  }

  // Expiry from MRZ
  const expiryMrzMatch = text.match(/\d{6}<\d[MF<](\d{6})/);
  let expiryDate = null;
  if (expiryMrzMatch) {
    const raw = expiryMrzMatch[1];
    const year = parseInt(raw.slice(0, 2));
    const month = raw.slice(2, 4);
    const day = raw.slice(4, 6);
    const fullYear = year > 30 ? `19${year}` : `20${String(year).padStart(2, '0')}`;
    expiryDate = `${day}/${month}/${fullYear}`;
  }

  return { name, dateOfBirth: dob, idNumber, gender: null, address: null, expiryDate };
};

// ─── Parse DOB string to Date ─────────────────────────────────────────────────
const parseDOB = (dobString) => {
  if (!dobString) return null;
  const [day, month, year] = dobString.split(/[\/\-]/);
  const date = new Date(`${year}-${month}-${day}`);
  return isNaN(date.getTime()) ? null : date;
};

// ─── Main OCR processor ───────────────────────────────────────────────────────
export const processDocument = async (imageUrl, documentType) => {
  try {
    const { text, confidence } = await runOCR(imageUrl);

    let extracted;
    switch (documentType) {
      case 'aadhaar':
        extracted = extractAadhaarData(text);
        break;
      case 'pan':
        extracted = extractPanData(text);
        break;
      case 'passport':
        extracted = extractPassportData(text);
        break;
      default:
        extracted = { name: null, dateOfBirth: null, idNumber: null };
    }

    return {
      name: extracted.name || null,
      dateOfBirth: parseDOB(extracted.dateOfBirth),
      idNumber: extracted.idNumber || null,
      address: extracted.address || null,
      fatherName: extracted.fatherName || null,
      gender: extracted.gender || null,
      expiryDate: extracted.expiryDate ? parseDOB(extracted.expiryDate) : null,
      rawText: text,
      confidence,
    };
  } catch (error) {
    console.error('OCR processing error:', error.message);
    return {
      name: null,
      dateOfBirth: null,
      idNumber: null,
      address: null,
      rawText: null,
      confidence: 0,
    };
  }
};
