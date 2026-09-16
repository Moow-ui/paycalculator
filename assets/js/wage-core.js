/**
 * ==============================================================================
 * [wage-core.js] 급여 계산 코어 엔진 (Vanilla JavaScript)
 * ==============================================================================
 * 
 * - 2026년 기준 법정 최저시급, 4대보험 요율, 세금, 주휴수당, 가산수당 계산
 * - 순수 계산 로직 및 요율 상수로만 구성 (UI 의존성 없음)
 * - 브라우저 환경(window.WageCore) 및 Node.js(CommonJS/ES Module) 환경 모두 지원
 * ==============================================================================
 */

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    // AMD
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    // Node.js / CommonJS
    module.exports = factory();
  } else {
    // Browser global (root is window)
    root.WageCore = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /**
   * ==========================================================================
   * 1. 요율 상수 (RATES) - 매년 이 객체만 수정하여 최신 법령 반영 가능
   * ==========================================================================
   */
  const RATES = Object.freeze({
    // 기준 연도
    YEAR: 2026,

    // 2026년 법정 최저시급 (원)
    MIN_HOURLY_WAGE: 10320,

    // 주 -> 월 환산 계수 (365일 ÷ 12개월 ÷ 7일 = 약 4.345238...)
    WEEKS_PER_MONTH: 4.345,

    // 국민연금 요율 (총 9.5% - 근로자 4.75% / 사업주 4.75%)
    NATIONAL_PENSION: Object.freeze({
      NAME: '국민연금',
      TOTAL: 0.095,
      WORKER: 0.0475,
      EMPLOYER: 0.0475,
    }),

    // 건강보험 요율 (총 7.19% - 근로자 3.595% / 사업주 3.595%)
    HEALTH_INSURANCE: Object.freeze({
      NAME: '건강보험',
      TOTAL: 0.0719,
      WORKER: 0.03595,
      EMPLOYER: 0.03595,
    }),

    // 노인장기요양보험 요율 (건강보험료의 13.14% - 근로자 50% / 사업주 50%)
    LONG_TERM_CARE: Object.freeze({
      NAME: '장기요양',
      RATE_OF_HEALTH: 0.1314,
      WORKER_SHARE: 0.5,
      EMPLOYER_SHARE: 0.5,
    }),

    // 고용보험 요율 (근로자 0.9% / 사업주 1.15% - 150인 미만 기업 기준)
    EMPLOYMENT_INSURANCE: Object.freeze({
      NAME: '고용보험',
      WORKER: 0.009,
      EMPLOYER: 0.0115,
    }),

    // 산재보험 요율 (사업주 전액 부담, 업종 평균 1.47%)
    INDUSTRIAL_ACCIDENT: Object.freeze({
      NAME: '산재보험',
      WORKER: 0.0,
      EMPLOYER: 0.0147,
    }),

    // 3.3% 프리랜서 사업소득세 원천징수 요율 (사업소득세 3% + 지방소득세 0.3%)
    BUSINESS_INCOME_TAX: 0.033,

    // 법적 근로 기준 상수
    STANDARD_WEEKLY_HOURS_LIMIT: 40,   // 법정 1주 소정근로 상한선 (40시간)
    MIN_WEEKLY_HOURS_HOLIDAY_PAY: 15, // 주휴수당 대상 최소 주 소정근로시간 (15시간)
    MIN_MONTHLY_HOURS_PENSION_HEALTH: 60, // 국민연금·건강보험 가입 최소 월 소정근로시간 (60시간)
    MIN_WEEKLY_HOURS_EMPLOYMENT: 15,  // 고용보험 가입 최소 주 소정근로시간 (15시간)
    HOLIDAY_DAILY_STANDARD_HOURS: 8,  // 휴일근로 가산 분기점 (8시간 이내 0.5 가산, 초과 1.0 가산)
  });

  /**
   * ==========================================================================
   * 2. 유틸리티 함수 (반올림 및 절사)
   * ==========================================================================
   */

  /**
   * 임금 원 단위 반올림 처리
   * @param {number} value 
   * @returns {number}
   */
  function roundWage(value) {
    return Math.round(Number(value) || 0);
  }

  /**
   * 보험료 및 세금 원 단위 절사 처리 (Math.floor)
   * @param {number} value 
   * @returns {number}
   */
  function floorInsurance(value) {
    return Math.floor(Number(value) || 0);
  }

  /**
   * ==========================================================================
   * 3. 급여 계산 메인 함수 (calculateWage)
   * ==========================================================================
   * 
   * @param {Object} params - 급여 계산 파라미터
   * @param {number} [params.hourlyWage=10320] - 시급 (원 단위, 기본값: 2026 최저시급)
   * @param {number} [params.weeklyHours=0] - 1주 소정근로시간
   * @param {number} [params.workDaysPerWeek=5] - 주 근무일수
   * @param {string|boolean} [params.workplaceScale='5orMore'] - 사업장 규모 ('5orMore'|'under5', '5인 이상'|'5인 미만', true/false)
   * @param {number} [params.overtimeHours=0] - 주간 연장근로시간
   * @param {number} [params.nightHours=0] - 주간 야간근로시간 (22:00~06:00)
   * @param {number} [params.holidayHours=0] - 주간 휴일근로시간 (총 시간)
   * @param {number} [params.holidayHoursWithin8] - (선택) 주간 휴일근로 중 8시간 이내 시간
   * @param {number} [params.holidayHoursOver8] - (선택) 주간 휴일근로 중 8시간 초과 시간
   * @param {string} [params.insuranceType='fourMajor'] - 공제 유형 ('fourMajor'|'4대보험', 'freelancer'|'3.3%', 'none'|'공제없음'|'없음')
   * @param {boolean} [params.isContinuouslyEmployed3Months=false] - 주 15시간 미만 시 3개월 이상 계속근로 여부 (고용보험 가입용)
   * 
   * @returns {Object} 계산 결과 객체 (사용자 명시 한글 키 및 영문 키 포함)
   */
  function calculateWage(params = {}) {
    const warnings = [];

    // [1] 시급 검증 및 최저시급 미달 체크
    const hourlyWageInput = params.hourlyWage !== undefined && params.hourlyWage !== null
      ? Number(params.hourlyWage)
      : RATES.MIN_HOURLY_WAGE;

    const hourlyWage = isNaN(hourlyWageInput) || hourlyWageInput < 0 ? RATES.MIN_HOURLY_WAGE : hourlyWageInput;
    const isBelowMinimumWage = hourlyWage < RATES.MIN_HOURLY_WAGE;

    if (isBelowMinimumWage) {
      warnings.push(`시급(${hourlyWage.toLocaleString()}원)이 ${RATES.YEAR}년 법정 최저시급(${RATES.MIN_HOURLY_WAGE.toLocaleString()}원)보다 낮습니다.`);
    }

    // [2] 근로시간 및 근무 조건 정규화
    const weeklyHours = Math.max(0, Number(params.weeklyHours) || 0);
    const workDaysPerWeek = Math.max(0, Number(params.workDaysPerWeek) || 0);
    const overtimeHours = Math.max(0, Number(params.overtimeHours) || 0);
    const nightHours = Math.max(0, Number(params.nightHours) || 0);

    // 사업장 규모 판정 (5인 이상 여부)
    let is5OrMore = true;
    if (typeof params.workplaceScale === 'boolean') {
      is5OrMore = params.workplaceScale;
    } else if (typeof params.workplaceScale === 'string') {
      const scaleStr = params.workplaceScale.trim().toLowerCase();
      if (scaleStr === 'under5' || scaleStr.includes('5인 미만') || scaleStr.includes('5인미만')) {
        is5OrMore = false;
      } else {
        is5OrMore = true;
      }
    }

    // 휴일근로시간 분할 (8시간 이내 / 8시간 초과)
    let holidayWithin8 = 0;
    let holidayOver8 = 0;
    if (params.holidayHoursWithin8 !== undefined || params.holidayHoursOver8 !== undefined) {
      holidayWithin8 = Math.max(0, Number(params.holidayHoursWithin8) || 0);
      holidayOver8 = Math.max(0, Number(params.holidayHoursOver8) || 0);
    } else {
      const totalHoliday = Math.max(0, Number(params.holidayHours) || 0);
      holidayWithin8 = Math.min(totalHoliday, RATES.HOLIDAY_DAILY_STANDARD_HOURS);
      holidayOver8 = Math.max(0, totalHoliday - RATES.HOLIDAY_DAILY_STANDARD_HOURS);
    }

    // 공제 유형 정규화
    let insuranceType = 'fourMajor'; // 기본값: 4대보험
    if (params.insuranceType) {
      const typeStr = String(params.insuranceType).trim().toLowerCase();
      if (typeStr === 'freelancer' || typeStr.includes('3.3') || typeStr.includes('사업소득')) {
        insuranceType = 'freelancer';
      } else if (typeStr === 'none' || typeStr.includes('없음') || typeStr.includes('미가입')) {
        insuranceType = 'none';
      } else {
        insuranceType = 'fourMajor';
      }
    }

    const isContinuouslyEmployed3Months = Boolean(params.isContinuouslyEmployed3Months);

    // =========================================================================
    // [3] 주 단위 임금 항목 계산 (규칙 1, 2, 3)
    // =========================================================================

    // 1. 기본급 (시급 × 1주 소정근로시간)
    const weeklyBasePay = roundWage(weeklyHours * hourlyWage);

    // 2. 주휴수당 = (1주 소정근로시간 ÷ 40) × 8 × 시급
    //    - 1주 소정근로시간 15시간 미만이면 0원
    //    - 40시간 초과 시 40시간으로 상한 처리
    let weeklyHolidayPay = 0;
    let weeklyHolidayPayHours = 0;
    if (weeklyHours >= RATES.MIN_WEEKLY_HOURS_HOLIDAY_PAY) {
      const cappedHours = Math.min(weeklyHours, RATES.STANDARD_WEEKLY_HOURS_LIMIT);
      weeklyHolidayPayHours = (cappedHours / RATES.STANDARD_WEEKLY_HOURS_LIMIT) * 8;
      weeklyHolidayPay = roundWage(weeklyHolidayPayHours * hourlyWage);
    }

    // 3. 가산수당 계산
    //    가산수당은 5인 이상 사업장에서만 적용. 5인 미만 사업장은 전부 1.0배(가산 0)
    //    - 연장근로: 5인 이상 1.5배 (기본 1.0 + 가산 0.5) / 5인 미만 1.0배
    //    - 야간근로(22:00~06:00): 5인 이상 0.5배 가산 (연장과 중복 적용 가능) / 5인 미만 0원
    //    - 휴일근로: 5인 이상 8시간 이내 1.5배 (가산 0.5), 8시간 초과 2.0배 (가산 1.0) / 5인 미만 1.0배
    const overtimeRate = is5OrMore ? 1.5 : 1.0;
    const weeklyOvertimePay = roundWage(overtimeHours * hourlyWage * overtimeRate);

    const nightRate = is5OrMore ? 0.5 : 0.0;
    const weeklyNightPay = roundWage(nightHours * hourlyWage * nightRate);

    let weeklyHolidayWorkPay = 0;
    if (is5OrMore) {
      const payWithin8 = holidayWithin8 * hourlyWage * 1.5;
      const payOver8 = holidayOver8 * hourlyWage * 2.0;
      weeklyHolidayWorkPay = roundWage(payWithin8 + payOver8);
    } else {
      weeklyHolidayWorkPay = roundWage((holidayWithin8 + holidayOver8) * hourlyWage * 1.0);
    }

    // 주급 합계
    const weeklyGrossPay = weeklyBasePay + weeklyHolidayPay + weeklyOvertimePay + weeklyNightPay + weeklyHolidayWorkPay;

    // =========================================================================
    // [4] 월 단위 환산 (규칙 4: 주급 × 4.345)
    // =========================================================================
    const monthlyBasePay = roundWage(weeklyBasePay * RATES.WEEKS_PER_MONTH);
    const monthlyHolidayPay = roundWage(weeklyHolidayPay * RATES.WEEKS_PER_MONTH);
    const monthlyOvertimePay = roundWage(weeklyOvertimePay * RATES.WEEKS_PER_MONTH);
    const monthlyNightPay = roundWage(weeklyNightPay * RATES.WEEKS_PER_MONTH);
    const monthlyHolidayWorkPay = roundWage(weeklyHolidayWorkPay * RATES.WEEKS_PER_MONTH);

    // 세전 월 급여 총액
    const totalGrossPay = monthlyBasePay + monthlyHolidayPay + monthlyOvertimePay + monthlyNightPay + monthlyHolidayWorkPay;

    // =========================================================================
    // [5] 4대보험 가입 조건 판정 및 공제 계산 (규칙 6)
    // =========================================================================
    // 월 환산 소정근로시간
    const monthlyStandardHours = weeklyHours * RATES.WEEKS_PER_MONTH;

    // 가입 요건 판정
    // - 국민연금 & 건강보험: 월 소정근로 60시간 이상 시 가입 (미만 시 제외)
    const isPensionHealthEligible = monthlyStandardHours >= RATES.MIN_MONTHLY_HOURS_PENSION_HEALTH;

    // - 고용보험: 주 15시간 이상이거나, 주 15시간 미만이어도 3개월 이상 계속근로 시 가입
    const isEmploymentEligible = (weeklyHours >= RATES.MIN_WEEKLY_HOURS_EMPLOYMENT) || isContinuouslyEmployed3Months;

    // - 산재보험: 근로시간 무관 항상 사업주 전액 부담
    const isIndustrialAccidentEligible = true;

    // 가입 상태 안내 경고/메시지 생성
    if (insuranceType === 'fourMajor') {
      if (!isPensionHealthEligible) {
        warnings.push(`월 소정근로시간(${monthlyStandardHours.toFixed(1)}시간)이 60시간 미만으로 국민연금·건강보험 가입 대상에서 제외됩니다.`);
      }
      if (!isEmploymentEligible) {
        warnings.push(`주 소정근로시간(${weeklyHours}시간)이 15시간 미만으로 고용보험 가입 대상에서 제외됩니다. (3개월 이상 계속근로 시 가입 가능)`);
      }
    }

    // 공제 계산 객체 초기화
    let workerDeductions = {
      국민연금: 0,
      건강보험: 0,
      장기요양: 0,
      고용보험: 0,
      합계: 0,
    };

    let employerContributions = {
      국민연금: 0,
      건강보험: 0,
      장기요양: 0,
      고용보험: 0,
      산재: 0,
      합계: 0,
    };

    if (insuranceType === 'fourMajor') {
      // 1) 국민연금 (원 단위 절사: Math.floor)
      if (isPensionHealthEligible) {
        workerDeductions.국민연금 = floorInsurance(totalGrossPay * RATES.NATIONAL_PENSION.WORKER);
        employerContributions.국민연금 = floorInsurance(totalGrossPay * RATES.NATIONAL_PENSION.EMPLOYER);
      }

      // 2) 건강보험 (원 단위 절사: Math.floor)
      if (isPensionHealthEligible) {
        workerDeductions.건강보험 = floorInsurance(totalGrossPay * RATES.HEALTH_INSURANCE.WORKER);
        employerContributions.건강보험 = floorInsurance(totalGrossPay * RATES.HEALTH_INSURANCE.EMPLOYER);

        // 3) 노인장기요양보험: 건강보험료 × 13.14% (근로자·사업주 절반씩, 원 단위 절사)
        workerDeductions.장기요양 = floorInsurance(workerDeductions.건강보험 * RATES.LONG_TERM_CARE.RATE_OF_HEALTH);
        employerContributions.장기요양 = floorInsurance(employerContributions.건강보험 * RATES.LONG_TERM_CARE.RATE_OF_HEALTH);
      }

      // 4) 고용보험 (원 단위 절사: Math.floor)
      if (isEmploymentEligible) {
        workerDeductions.고용보험 = floorInsurance(totalGrossPay * RATES.EMPLOYMENT_INSURANCE.WORKER);
        employerContributions.고용보험 = floorInsurance(totalGrossPay * RATES.EMPLOYMENT_INSURANCE.EMPLOYER);
      }

      // 5) 산재보험 (근로시간 무관 항상 사업주 전액 부담, 원 단위 절사)
      employerContributions.산재 = floorInsurance(totalGrossPay * RATES.INDUSTRIAL_ACCIDENT.EMPLOYER);

      // 공제 합계 산출
      workerDeductions.합계 = workerDeductions.국민연금 +
        workerDeductions.건강보험 +
        workerDeductions.장기요양 +
        workerDeductions.고용보험;

      employerContributions.합계 = employerContributions.국민연금 +
        employerContributions.건강보험 +
        employerContributions.장기요양 +
        employerContributions.고용보험 +
        employerContributions.산재;

    } else if (insuranceType === 'freelancer') {
      // 3.3% 프리랜서 사업소득 원천징수
      // 근로자 공제: 세전총액 × 3.3% (원 단위 절사)
      const taxTotal = floorInsurance(totalGrossPay * RATES.BUSINESS_INCOME_TAX);

      workerDeductions = {
        국민연금: 0,
        건강보험: 0,
        장기요양: 0,
        고용보험: 0,
        사업소득세: taxTotal,
        합계: taxTotal,
      };

      employerContributions = {
        국민연금: 0,
        건강보험: 0,
        장기요양: 0,
        고용보험: 0,
        산재: 0,
        합계: 0,
      };

    } else {
      // 공제 없음
      workerDeductions = {
        국민연금: 0,
        건강보험: 0,
        장기요양: 0,
        고용보험: 0,
        합계: 0,
      };

      employerContributions = {
        국민연금: 0,
        건강보험: 0,
        장기요양: 0,
        고용보험: 0,
        산재: 0,
        합계: 0,
      };
    }

    // =========================================================================
    // [6] 실수령액 및 총인건비 계산
    // =========================================================================
    // 실수령액 = 세전총액 - 근로자공제 합계
    const netPay = totalGrossPay - workerDeductions.합계;

    // 총인건비 = 세전총액 + 사업주부담 합계
    const totalLaborCost = totalGrossPay + employerContributions.합계;

    // =========================================================================
    // [7] 결과 객체 반환 (사용자 요청 명세 100% 일치)
    // =========================================================================
    return {
      // 1) 사용자 요청 필수 한글 속성
      기본급: monthlyBasePay,
      주휴수당: monthlyHolidayPay,
      연장수당: monthlyOvertimePay,
      야간수당: monthlyNightPay,
      휴일수당: monthlyHolidayWorkPay,
      세전총액: totalGrossPay,
      근로자공제: workerDeductions,
      사업주부담: employerContributions,
      실수령액: netPay,
      총인건비: totalLaborCost,
      경고메시지배열: warnings,

      // 2) 개발 편의 및 호환성을 위한 부가 메타데이터
      metadata: {
        year: RATES.YEAR,
        hourlyWage,
        weeklyHours,
        workDaysPerWeek,
        is5OrMore,
        insuranceType,
        isBelowMinimumWage,
        monthlyStandardHours,
        isPensionHealthEligible,
        isEmploymentEligible,
        isIndustrialAccidentEligible,
        weekly: {
          기본급: weeklyBasePay,
          주휴수당: weeklyHolidayPay,
          연장수당: weeklyOvertimePay,
          야간수당: weeklyNightPay,
          휴일수당: weeklyHolidayWorkPay,
          세전주급: weeklyGrossPay,
          주휴수당시간: weeklyHolidayPayHours,
        }
      }
    };
  }

  // 모듈 외부에 공개할 API
  return {
    RATES,
    calculateWage,
    roundWage,
    floorInsurance,
  };
}));
