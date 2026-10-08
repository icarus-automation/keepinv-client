import { settleSale } from './pos.types';

const openCart = {
  committing: false,
  cartCount: 1,
  totalCents: 20000,
  creditCents: 0,
  cashTenderedCents: 20000,
  cash: true,
  hasCustomer: false,
};

describe('settleSale', () => {
  it('lets a walk-in cash sale complete when tender covers the total', () => {
    const settlement = settleSale(openCart);

    expect(settlement.canComplete).toBe(true);
    expect(settlement.amountTenderedCents).toBe(20000);
    expect(settlement.changeDueCents).toBe(0);
    expect(settlement.hint).toBeNull();
  });

  it('keeps a short cash tender from completing', () => {
    const settlement = settleSale({ ...openCart, cashTenderedCents: 5000 });

    expect(settlement.canComplete).toBe(false);
    expect(settlement.hint).toBe('Enter the amount tendered.');
  });

  it('charges a card for the part that is not on credit', () => {
    const settlement = settleSale({
      ...openCart,
      cash: false,
      cashTenderedCents: 0,
      creditCents: 15000,
      hasCustomer: true,
    });

    expect(settlement.canComplete).toBe(true);
    expect(settlement.amountDueCents).toBe(5000);
    expect(settlement.amountTenderedCents).toBe(5000);
    expect(settlement.changeDueCents).toBe(0);
  });

  it('hands back the cash that exceeded the paid portion', () => {
    const settlement = settleSale({
      ...openCart,
      creditCents: 5000,
      cashTenderedCents: 20000,
      hasCustomer: true,
    });

    expect(settlement.canComplete).toBe(true);
    expect(settlement.changeDueCents).toBe(5000);
  });

  it('refuses credit without a customer', () => {
    const settlement = settleSale({
      ...openCart,
      creditCents: 15000,
      cashTenderedCents: 5000,
    });

    expect(settlement.canComplete).toBe(false);
    expect(settlement.hint).toBe('Choose a customer.');
  });

  it('refuses credit above the total', () => {
    const settlement = settleSale({
      ...openCart,
      creditCents: 25000,
      hasCustomer: true,
    });

    expect(settlement.canComplete).toBe(false);
    expect(settlement.hint).toBe('Credit is more than the sale total.');
  });
});
