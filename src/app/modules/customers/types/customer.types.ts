import { PaymentMethod, SaleStatus } from '../../pos/types/pos.types';

/** Fields shared by a customer record. `POST /customers` returns this shape. */
export interface CustomerIdentity {
  id: string;
  name: string;
  phone: string | null;
  note: string | null;
}

/** A row from `GET /customers`. `balance` is a 2-decimal string. */
export interface CustomerListItem extends CustomerIdentity {
  balance: string;
}

/** One purchase on a customer, newest first. */
export interface CustomerSale {
  id: string;
  receiptNo: string;
  status: SaleStatus;
  completedAt: string;
  total: string;
  creditAmount: string;
}

/** One payment collected against a customer's balance. */
export interface CustomerPayment {
  id: string;
  amount: string;
  paymentMethod: PaymentMethod;
  paidAt: string;
  note: string | null;
}

/** `GET /customers/:id` and `PATCH /customers/:id`. */
export interface CustomerDetail extends CustomerListItem {
  sales: CustomerSale[];
  payments: CustomerPayment[];
}

/** Body for `POST /customers` and `PATCH /customers/:id`. */
export interface CustomerRequest {
  name?: string;
  phone?: string;
  note?: string;
}

/** Body for `POST /customers/:id/payments`. `amount` has at most 2 decimals. */
export interface CustomerPaymentRequest {
  amount: number;
  paymentMethod: PaymentMethod;
  note?: string;
}
