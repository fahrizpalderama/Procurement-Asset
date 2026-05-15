export interface ProcurementItem {
  id: string;
  name: string;
  quantity: number | string;
  unit: string;
  price: number | string;
  totalPrice: number | string;
  status: string;
  requester: string;
  description: string;
  refLink: string;
  refPhoto: string;
  timestamp?: string;
  verificationStatus?: "PENDING" | "APPROVED" | "REJECTED";
  verificationReason?: string;
  verifierName?: string;
  rowIndex?: number;
}

export interface AuthStatus {
  isAuthenticated: boolean;
}
