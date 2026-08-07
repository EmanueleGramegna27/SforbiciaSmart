// Italian municipalities Belfiore codes dataset
export const COMMON_CITIES = [
  { name: "Roma", province: "RM", belfiore: "H501" },
  { name: "Milano", province: "MI", belfiore: "F205" },
  { name: "Napoli", province: "NA", belfiore: "F839" },
  { name: "Torino", province: "TO", belfiore: "L219" },
  { name: "Palermo", province: "PA", belfiore: "G273" },
  { name: "Genova", province: "GE", belfiore: "D969" },
  { name: "Bologna", province: "BO", belfiore: "A944" },
  { name: "Firenze", province: "FI", belfiore: "D612" },
  { name: "Bari", province: "BA", belfiore: "A662" },
  { name: "Catania", province: "CT", belfiore: "C351" },
  { name: "Venezia", province: "VE", belfiore: "L736" },
  { name: "Verona", province: "VR", belfiore: "L781" },
  { name: "Messina", province: "ME", belfiore: "F158" },
  { name: "Padova", province: "PD", belfiore: "G224" },
  { name: "Trieste", province: "TS", belfiore: "L424" },
  { name: "Taranto", province: "TA", belfiore: "L049" },
  { name: "Brescia", province: "BS", belfiore: "B157" },
  { name: "Prato", province: "PO", belfiore: "G999" },
  { name: "Reggio Calabria", province: "RC", belfiore: "H224" },
  { name: "Modena", province: "MO", belfiore: "F257" },
  { name: "Parma", province: "PR", belfiore: "G337" },
  { name: "Perugia", province: "PG", belfiore: "G478" },
  { name: "Reggio Emilia", province: "RE", belfiore: "H223" },
  { name: "Livorno", province: "LI", belfiore: "E625" },
  { name: "Cagliari", province: "CA", belfiore: "B354" },
  { name: "Foggia", province: "FG", belfiore: "D643" },
  { name: "Ravenna", province: "RA", belfiore: "H199" },
  { name: "Salerno", province: "SA", belfiore: "H703" },
  { name: "Rimini", province: "RN", belfiore: "H294" },
  { name: "Ferrara", province: "FE", belfiore: "D548" },
  { name: "Sassari", province: "SS", belfiore: "I452" },
  { name: "Latina", province: "LT", belfiore: "E472" },
  { name: "Monza", province: "MB", belfiore: "F704" },
  { name: "Siracusa", province: "SR", belfiore: "I754" },
  { name: "Pescara", province: "PE", belfiore: "G482" },
  { name: "Bergamo", province: "BG", belfiore: "A794" },
  { name: "Forlì", province: "FC", belfiore: "D704" },
  { name: "Trento", province: "TN", belfiore: "L378" },
  { name: "Vicenza", province: "VI", belfiore: "L840" },
  { name: "Terni", province: "TR", belfiore: "L117" },
  { name: "Bolzano", province: "BZ", belfiore: "A952" },
  { name: "Novara", province: "NO", belfiore: "F952" },
  { name: "Ancona", province: "AN", belfiore: "A271" }
];

export const calculateCodiceFiscale = (
  fullName: string,
  birthDateStr: string, // YYYY-MM-DD
  gender: "M" | "F" | "",
  belfioreCode: string
): string => {
  if (!fullName || !birthDateStr || !gender || !belfioreCode) return "";
  
  // Clean inputs
  const cleanedName = fullName.replace(/[^a-zA-Z\s]/g, "").toUpperCase();
  const cleanedBelfiore = belfioreCode.trim().toUpperCase();
  if (cleanedBelfiore.length !== 4) return "";

  // Split Name and Surname
  const parts = cleanedName.trim().split(/\s+/);
  const surname = parts[0] || "";
  const name = parts.slice(1).join(" ") || surname;

  if (!surname || !name) return "";

  const consonantsOf = (str: string) => str.replace(/[^BCDFGHJKLMNPQRSTVWXYZ]/g, "");
  const vowelsOf = (str: string) => str.replace(/[^AEIOU]/g, "");

  // 1. Surname code (3 chars)
  let surnameCode = "";
  const sCons = consonantsOf(surname);
  const sVow = vowelsOf(surname);
  const sAll = sCons + sVow + "XXX";
  surnameCode = sAll.slice(0, 3);

  // 2. Name code (3 chars)
  let nameCode = "";
  const nCons = consonantsOf(name);
  const nVow = vowelsOf(name);
  
  if (nCons.length >= 4) {
    // Take 1st, 3rd, and 4th consonant
    nameCode = nCons[0] + nCons[2] + nCons[3];
  } else {
    const nAll = nCons + nVow + "XXX";
    nameCode = nAll.slice(0, 3);
  }

  // 3. Birth Date Code
  // birthDateStr is YYYY-MM-DD
  const dateParts = birthDateStr.split("-");
  if (dateParts.length !== 3) return "";
  const year = dateParts[0]; // YYYY
  const month = parseInt(dateParts[1], 10); // MM
  const day = parseInt(dateParts[2], 10); // DD

  const yearCode = year.slice(-2);

  const monthsMap = ["", "A", "B", "C", "D", "E", "H", "L", "M", "P", "R", "S", "T"];
  const monthCode = monthsMap[month] || "";

  let dayNum = day;
  if (gender === "F") {
    dayNum += 40;
  }
  const dayCode = dayNum.toString().padStart(2, "0");

  // Base 15 characters
  const base15 = (surnameCode + nameCode + yearCode + monthCode + dayCode + cleanedBelfiore).toUpperCase();
  if (base15.length !== 15) return "";

  // 4. Check Character (16th character)
  const oddValues: Record<string, number> = {
    '0': 1, '1': 0, '2': 5, '3': 7, '4': 9, '5': 13, '6': 15, '7': 17, '8': 19, '9': 21,
    'A': 1, 'B': 0, 'C': 5, 'D': 7, 'E': 9, 'F': 13, 'G': 15, 'H': 17, 'I': 19, 'J': 21,
    'K': 2, 'L': 4, 'M': 18, 'N': 20, 'O': 11, 'P': 3, 'Q': 6, 'R': 8, 'S': 12, 'T': 14,
    'U': 16, 'V': 10, 'W': 22, 'X': 25, 'Y': 24, 'Z': 23
  };

  const evenValues: Record<string, number> = {
    '0': 0, '1': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
    'A': 0, 'B': 1, 'C': 2, 'D': 3, 'E': 4, 'F': 5, 'G': 6, 'H': 7, 'I': 8, 'J': 9,
    'K': 10, 'L': 11, 'M': 12, 'N': 13, 'O': 14, 'P': 15, 'Q': 16, 'R': 17, 'S': 18, 'T': 19,
    'U': 20, 'V': 21, 'W': 10, 'X': 23, 'Y': 24, 'Z': 25
  };

  let sum = 0;
  for (let i = 0; i < 15; i++) {
    const char = base15[i];
    if (i % 2 === 0) {
      sum += oddValues[char] !== undefined ? oddValues[char] : 0;
    } else {
      sum += evenValues[char] !== undefined ? evenValues[char] : 0;
    }
  }

  const remainder = sum % 26;
  const checkChar = String.fromCharCode(65 + remainder); // 0 -> 'A', 1 -> 'B', etc.

  return base15 + checkChar;
};
