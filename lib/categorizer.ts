export type CategoryType =
  | "Salary / Payroll"
  | "Transfer (Inflow)"
  | "Transfer (Outflow)"
  | "Gambling & Betting"
  | "Loan / Payday Apps"
  | "Bank Penalty / NSF"
  | "Crypto & P2P"
  | "ATM / Cash Withdrawal"
  | "Bills & Utilities"
  | "POS & Shopping"
  | "Investment & Savings"
  | "Bank Fees & Stamp Duty"
  | "Other";

export interface TransactionCategoryResult {
  category: CategoryType;
  isGambling: boolean;
  isPaydayLoan: boolean;
  isPenaltyOrNSF: boolean;
  isCrypto: boolean;
  isSalary: boolean;
  riskFlag?: string;
}

export function categorizeTransaction(
  description: string,
  debit: number,
  credit: number
): TransactionCategoryResult {
  const text = (description || "").toLowerCase();

  // 1. Gambling & Sports Betting
  const isGambling =
    /bet9ja|sportybet|1xbet|betway|nairabet|surebet|merrybet|stake\b|draftkings|fanduel|bovada|casino|poker|betking|bangbet|livescorebet|parimatch|betwinner|22bet|melbet|accessbet/i.test(
      text
    );

  // 2. Payday Loans / Micro-Lenders / BNPL
  const isPaydayLoan =
    /fairmoney|carbon\b|branch\b|quickcheck|renmoney|palmpay loan|opay loan|page financial|kuda overdraft|specta|easylending|affirm|klarna|afterpay|credit direct|zedvance|money in minutes|lendigo|aella credit/i.test(
      text
    );

  // 3. Bank Penalties, NSF, Dishonoured & Overdraft Fees
  const isPenaltyOrNSF =
    /returned cheque|unpaid cheque|dishonou?red|nsf|insufficient funds|overdraft charge|excess fee|penalty fee|reversal charge|unarranged overdraft/i.test(
      text
    );

  // 4. Crypto & P2P Exchanges
  const isCrypto =
    /binance|bybit|kucoin|paxful|roqqu|quidax|luno|yellowcard|remitano|crypto|coinbase|kraken|bitmama|bundle africa/i.test(
      text
    );

  // 5. Salary / Payroll
  const isSalary =
    credit > 0 &&
    (/salary|payroll|wages|net pay|stipend|allowance|monthly comp|remuneration|staff pay/i.test(
      text
    ) ||
      (/ltd|plc|limited|technologies|services|consulting|hospital|corp|group/i.test(
        text
      ) &&
        credit >= 50000));

  let category: CategoryType = "Other";
  let riskFlag: string | undefined = undefined;

  if (isGambling) {
    category = "Gambling & Betting";
    riskFlag = "Gambling Merchant Outflow";
  } else if (isPaydayLoan) {
    category = "Loan / Payday Apps";
    riskFlag = "Payday / Micro-Loan Transaction";
  } else if (isPenaltyOrNSF) {
    category = "Bank Penalty / NSF";
    riskFlag = "Insufficient Funds / Bank Penalty";
  } else if (isCrypto) {
    category = "Crypto & P2P";
    riskFlag = "High-Risk Crypto / P2P Exchange";
  } else if (isSalary) {
    category = "Salary / Payroll";
  } else if (/savings|piggyvest|cowrywise|wealth|mutual fund|investment|treasury|fixed deposit/i.test(text)) {
    category = "Investment & Savings";
  } else if (/atm|cash withdrawal|pos cash|fast cash/i.test(text)) {
    category = "ATM / Cash Withdrawal";
  } else if (/rent|utility|electric|water|internet|spectranet|airtime|mtn|airtel|glo|9mobile|dstv|gotv|startimes|netflix|bill|subscription/i.test(text)) {
    category = "Bills & Utilities";
  } else if (/pos|purchase|merchant|store|supermarket|mall|shoprite|spar|fuel|filling station|e-commerce|uber|bolt/i.test(text)) {
    category = "POS & Shopping";
  } else if (/maintenance fee|sms alert|vat|stamp duty|electronic money transfer levy|emtl|commission/i.test(text)) {
    category = "Bank Fees & Stamp Duty";
  } else if (credit > 0 && /transfer|nip|instant|trf|inward|fip|cr\/|credit/i.test(text)) {
    category = "Transfer (Inflow)";
  } else if (debit > 0 && /transfer|nip|instant|trf|outward|dr\/|debit/i.test(text)) {
    category = "Transfer (Outflow)";
  } else if (credit > 0) {
    category = "Transfer (Inflow)";
  } else if (debit > 0) {
    category = "Transfer (Outflow)";
  }

  return {
    category,
    isGambling,
    isPaydayLoan,
    isPenaltyOrNSF,
    isCrypto,
    isSalary,
    riskFlag,
  };
}
