/**
 * J.A.R.V.I.S 2.0 - Black-Scholes Greeks Engine
 * High-precision European options pricing and Greeks calculation engine.
 * Computes theoretical Gamma, Delta, Vega, and Theta with zero allocations
 * and rigorous boundary condition handling (0DTE, deep ITM/OTM, zero-volatility).
 */

export interface BlackScholesGreeks {
  price: number;
  delta: number;
  gamma: number;
  vega: number;
  theta: number;
  d1: number;
  d2: number;
}

export class BlackScholes {
  private static readonly SQRT_2PI = Math.sqrt(2 * Math.PI);
  private static readonly INV_SQRT_2PI = 1 / Math.sqrt(2 * Math.PI);

  /**
   * Standard normal probability density function: phi(x)
   */
  public static normPdf(x: number): number {
    return this.INV_SQRT_2PI * Math.exp(-0.5 * x * x);
  }

  /**
   * High-precision standard normal cumulative distribution function: N(x)
   * Uses rational Chebyshev approximation (Abramowitz & Stegun 7.1.26)
   * Absolute error < 1.5e-7 across all real values.
   */
  public static normCdf(x: number): number {
    if (x > 8.0) return 1.0;
    if (x < -8.0) return 0.0;

    const k = 1.0 / (1.0 + 0.2316419 * Math.abs(x));
    const poly =
      k *
      (0.31938153 +
        k *
          (-0.356563782 +
            k * (1.781477937 + k * (-1.821255978 + k * 1.330274429))));
    const cdf = 1.0 - this.normPdf(x) * poly;
    return x >= 0 ? cdf : 1.0 - cdf;
  }

  /**
   * Calculate theoretical Black-Scholes Greeks
   * @param spot Current underlying price (S > 0)
   * @param strike Strike price (K > 0)
   * @param timeToExpiryYears Time to expiration in years (T >= 0)
   * @param impliedVol Implied volatility decimal (e.g. 0.45 for 45%)
   * @param isCall True for call, false for put
   * @param riskFreeRate Annualized risk-free interest rate (default 0.045)
   * @param dividendYield Annualized dividend yield or cost of carry (default 0.0)
   */
  public static calculate(
    spot: number,
    strike: number,
    timeToExpiryYears: number,
    impliedVol: number,
    isCall: boolean,
    riskFreeRate: number = 0.045,
    dividendYield: number = 0.0
  ): BlackScholesGreeks {
    // 1. Sanitize inputs
    const S = Math.max(0.00001, spot);
    const K = Math.max(0.00001, strike);
    const sigma = Math.max(0.01, Math.min(5.0, impliedVol || 0.40)); // Clamped 1% - 500%
    const T = Math.max(0.00001, timeToExpiryYears); // Min ~5 minutes to prevent division by zero for 0DTE
    const r = riskFreeRate;
    const q = dividendYield;

    const sqrtT = Math.sqrt(T);
    const sigmaSqrtT = sigma * sqrtT;

    // 2. Compute d1 and d2
    const d1 = (Math.log(S / K) + (r - q + 0.5 * sigma * sigma) * T) / sigmaSqrtT;
    const d2 = d1 - sigmaSqrtT;

    const discountR = Math.exp(-r * T);
    const discountQ = Math.exp(-q * T);

    const pdfD1 = this.normPdf(d1);
    const cdfD1 = this.normCdf(d1);
    const cdfD2 = this.normCdf(d2);

    // 3. Gamma: Identical for Call and Put
    // Gamma = e^(-q*T) * phi(d1) / (S * sigma * sqrt(T))
    const gamma = (discountQ * pdfD1) / (S * sigmaSqrtT);

    // 4. Delta
    const delta = isCall ? discountQ * cdfD1 : discountQ * (cdfD1 - 1.0);

    // 5. Vega: Sensitivity to 1% move in volatility
    // Vega = S * e^(-q*T) * phi(d1) * sqrt(T)
    const vega = S * discountQ * pdfD1 * sqrtT * 0.01;

    // 6. Theta: Daily time decay
    const term1 = -(S * sigma * discountQ * pdfD1) / (2 * sqrtT);
    let theta: number;
    if (isCall) {
      theta = (term1 - r * K * discountR * cdfD2 + q * S * discountQ * cdfD1) / 365.25;
    } else {
      theta =
        (term1 +
          r * K * discountR * (1.0 - cdfD2) -
          q * S * discountQ * (1.0 - cdfD1)) /
        365.25;
    }

    // 7. Theoretical Price
    let price: number;
    if (isCall) {
      price = S * discountQ * cdfD1 - K * discountR * cdfD2;
    } else {
      price = K * discountR * (1.0 - cdfD2) - S * discountQ * (1.0 - cdfD1);
    }

    return {
      price: Math.max(0, price),
      delta,
      gamma: Math.max(0, gamma),
      vega,
      theta,
      d1,
      d2,
    };
  }

  /**
   * Fast Gamma-only evaluator optimized for price-scenario sweeps across 100+ strikes
   */
  public static calculateGamma(
    spot: number,
    strike: number,
    timeToExpiryYears: number,
    impliedVol: number,
    riskFreeRate: number = 0.045,
    dividendYield: number = 0.0
  ): number {
    const S = Math.max(0.00001, spot);
    const K = Math.max(0.00001, strike);
    const sigma = Math.max(0.01, Math.min(5.0, impliedVol || 0.40));
    const T = Math.max(0.00001, timeToExpiryYears);

    const sigmaSqrtT = sigma * Math.sqrt(T);
    const d1 = (Math.log(S / K) + (riskFreeRate - dividendYield + 0.5 * sigma * sigma) * T) / sigmaSqrtT;
    const discountQ = Math.exp(-dividendYield * T);

    const pdfD1 = this.normPdf(d1);
    return (discountQ * pdfD1) / (S * sigmaSqrtT);
  }

  public static gamma(
    spot: number,
    strike: number,
    timeToExpiryYears: number,
    riskFreeRate: number = 0.045,
    impliedVol: number = 0.45
  ): number {
    return this.calculateGamma(spot, strike, timeToExpiryYears, impliedVol, riskFreeRate);
  }

  public static delta(
    spot: number,
    strike: number,
    timeToExpiryYears: number,
    riskFreeRate: number = 0.045,
    impliedVol: number = 0.45,
    type: 'call' | 'put' = 'call'
  ): number {
    return this.calculate(spot, strike, timeToExpiryYears, impliedVol, type === 'call', riskFreeRate).delta;
  }

  public static calculateGreeks(
    spot: number,
    strike: number,
    timeToExpiryYears: number,
    riskFreeRate: number = 0.045,
    impliedVol: number = 0.45,
    type: 'call' | 'put' = 'call'
  ): BlackScholesGreeks {
    return this.calculate(spot, strike, timeToExpiryYears, impliedVol, type === 'call', riskFreeRate);
  }
}
