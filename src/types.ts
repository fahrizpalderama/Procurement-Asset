export interface ProcurementItem {
  id: string;
  name: string;
  category?: string;
  quantity: number | string;
  unit: string;
  price: number | string;
  totalPrice: number | string;
  status: string;
  storeLocation: string;
  requester: string;
  description: string;
  refLink: string;
  refPhoto: string;
  timestamp?: string;
  verificationStatus?: "PENDING" | "APPROVED" | "REJECTED" | "TRANSFERRED" | "REALIZED";
  verificationReason?: string;
  verifierName?: string;
  transferAmount?: number | string;
  transferNote?: string;
  transferEvidenceLink?: string;
  transferEvidencePhoto?: string;
  transferVerifier?: string;
  realizationAmount?: number | string;
  purchasedBy?: string;
  invoiceLink?: string;
  realizationPhoto?: string;
  rowIndex?: number;
}

export interface AuthStatus {
  isAuthenticated: boolean;
}
