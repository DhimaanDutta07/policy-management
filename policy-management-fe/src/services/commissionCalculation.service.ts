import axios from 'axios';

export interface CommissionMasterEntry {
  id: string;
  category: string;
  sub_category: string;
  commission_percentage: number;
  is_active: boolean;
}

export interface CommissionCalculationParams {
  policy_name_id: string;
  policyName?: string;
  policy_creation_status: 'Fresh' | 'Renewal' | 'Migration' | 'Portablity';
  sum_insured: number;
  deductible_amount_status: boolean;
  premium_amount: number;
}

function deriveCategory(policyName: string): string {
  const name = policyName.toLowerCase();
  if (name.includes('optima secure')) return 'Optima Secure';
  if (name.includes('stu')) return 'STU';
  if (name.includes('travel')) return 'Travel';
  if (name.includes('pa')) return 'PA (Fresh)';
  if (name.includes('sme')) {
    return 'SME';
  }
  return 'Other Retail';
}

function deriveSubCategory(
  category: string,
  policyStatus: string,
  sumInsured: number,
  deductibleStatus: boolean
): string[] {
  const isPortability = policyStatus === 'Portablity';

  if (category === 'Travel') return ['All SI'];
  if (category === 'All') return ['All SI'];
  if (category === 'PA (Fresh)') return ['Greater than or equal to 10 Lakhs'];
  if (category === 'SME (Fresh)') return ['Less than 10 Lakhs'];
  if (category === 'SME') return ['Greater than or equal to 10 Lakhs'];

  if (category === 'Optima Secure') {
    if (isPortability) return ['Portability - 25K Deductible (All SI)'];
    return ['Fresh'];
  }

  if (isPortability) {
    if (deductibleStatus) return ['Portability - 25K Deductible (All SI)', 'Portability - Less than 10 Lakhs'];
    return ['Portability - Less than 10 Lakhs', 'Portability - 25K Deductible (All SI)'];
  }

  if (sumInsured >= 1000000) {
    return ['Fresh - Greater than or equal to 10 Lakhs'];
  }
  return ['Fresh - Less than 10 Lakhs'];
}

export const commissionCalculationService = {
  async getCommissionMasterEntries(): Promise<CommissionMasterEntry[]> {
    try {
      const response = await axios.get(
        `${import.meta.env.VITE_BASE_URL}/api/v1/commission-master`,
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('authToken')}`,
          },
        }
      );
      const data = response.data;
      return Array.isArray(data) ? data : (data?.data || []);
    } catch (error) {
      console.error('Error fetching commission master:', error);
      return [];
    }
  },

  async calculateCommission(params: CommissionCalculationParams): Promise<{
    calculated_commission_amount: number;
    base_percentage: number;
    total_percentage: number;
    rule_found: boolean;
  }> {
    try {
      if (!params.premium_amount || params.premium_amount <= 0) {
        return { calculated_commission_amount: 0, base_percentage: 0, total_percentage: 0, rule_found: false };
      }

      const entries = await this.getCommissionMasterEntries();
      const activeEntries = entries.filter(e => e.is_active);

      if (activeEntries.length === 0) {
        return { calculated_commission_amount: 0, base_percentage: 0, total_percentage: 0, rule_found: false };
      }

      const policyName = params.policyName || '';
      const category = deriveCategory(policyName);
      const subCategories = deriveSubCategory(
        category,
        params.policy_creation_status,
        params.sum_insured,
        params.deductible_amount_status
      );

      let match: CommissionMasterEntry | undefined;

      for (const sub of subCategories) {
        match = activeEntries.find(
          e => e.category.toLowerCase() === category.toLowerCase() &&
               e.sub_category.toLowerCase() === sub.toLowerCase()
        );
        if (match) break;
      }

      if (!match) {
        match = activeEntries.find(
          e => e.category.toLowerCase() === 'all' &&
               e.sub_category.toLowerCase() === 'all si'
        );
      }

      if (!match) {
        return { calculated_commission_amount: 0, base_percentage: 0, total_percentage: 0, rule_found: false };
      }

      const percentage = Number(match.commission_percentage) || 0;
      const commissionAmount = (params.premium_amount * percentage) / 100;

      return {
        calculated_commission_amount: commissionAmount,
        base_percentage: percentage,
        total_percentage: percentage,
        rule_found: true,
      };
    } catch (error) {
      console.error('Error calculating commission:', error);
      return { calculated_commission_amount: 0, base_percentage: 0, total_percentage: 0, rule_found: false };
    }
  },
};
