import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Check, Loader2 } from 'lucide-react';
import { supabase } from '../../supabaseClient';

// Fallback API URL
const API_URL = '/api';

const CURRENCY_SYMBOLS = { USD: '$', EUR: '€', UAH: '₴' };
function getCurrencySymbol(currency) {
  return CURRENCY_SYMBOLS[currency] ?? CURRENCY_SYMBOLS.USD;
}

const PricingModal = ({ isOpen, onClose, currentPlanName }) => {
  const { t, i18n } = useTranslation();
  const [billingCycle, setBillingCycle] = useState('monthly');
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState(null);

  useEffect(() => {
    if (isOpen) {
        setLoading(true);
        const locale = i18n.language || 'en';
        fetch(`${API_URL}/plans?locale=${locale}`)
            .then(res => res.json())
            .then(data => {
                if (data.status === 'success') {
                    setPlans(data.data || []);
                }
            })
            .catch(err => console.error("Failed to load plans:", err))
            .finally(() => setLoading(false));
        supabase.auth.getSession().then(({ data: { session } }) => {
            setUserId(session?.user?.id ?? null);
        });
    }
  }, [isOpen, i18n.language]);

  if (!isOpen) return null;

  // Current plan tier (for disabling "Upgrade" on lower tiers)
  const currentPlanTier = (currentPlanName && plans.length)
    ? (plans.find((p) => p.name === currentPlanName)?.tier ?? 0)
    : 0;

  // Helper to style plans based on tier (and whether this is the user's current plan)
  const getPlanStyle = (tier, isCurrentPlan) => {
      if (isCurrentPlan) {
        return { highlight: false, isCurrent: true, btn: 'bg-gray-100 text-gray-700 cursor-default' };
      }
      if (tier === 2) return { highlight: true, isCurrent: false, btn: 'bg-purple-600 text-white hover:bg-purple-700 shadow-md' };
      if (tier === 3) return { highlight: false, isCurrent: false, btn: 'bg-gray-900 text-white hover:bg-gray-800' };
      return { highlight: false, isCurrent: false, btn: 'bg-gray-100 text-gray-700 hover:bg-gray-200' };
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 overflow-y-auto">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300 cursor-pointer" onClick={onClose}></div>
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-5xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 my-8">
        <button onClick={onClose} className="absolute top-4 right-4 p-2 hover:bg-gray-100 rounded-full text-gray-500 transition z-10">
          <X size={24} />
        </button>

        <div className="p-8 md:p-12 text-center bg-gray-50 border-b border-gray-100">
          <h2 className="text-3xl font-bold text-gray-900 mb-4">{t('pricing.title')}</h2>
          <p className="text-gray-500 mb-8 max-w-2xl mx-auto">{t('pricing.subtitle')}</p>
          
          <div className="inline-flex bg-white p-1 rounded-full border border-gray-200 shadow-sm relative">
            <button 
              onClick={() => setBillingCycle('monthly')}
              className={`px-6 py-2 rounded-full text-sm font-medium transition-all ${billingCycle === 'monthly' ? 'bg-gray-900 text-white shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
            >
              {t('pricing.monthly')}
            </button>
            <button 
              onClick={() => setBillingCycle('yearly')}
              className={`px-6 py-2 rounded-full text-sm font-medium transition-all flex items-center gap-2 ${billingCycle === 'yearly' ? 'bg-gray-900 text-white shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
            >
              {t('pricing.yearly')} <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-bold">{t('pricing.yearlyBadge')}</span>
            </button>
          </div>
        </div>

        <div className="p-8 md:p-12 bg-white">
          {loading ? (
              <div className="flex justify-center py-12"><Loader2 className="animate-spin text-gray-400" size={32} /></div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                {plans.map((plan) => {
                    const isCurrentPlan = Boolean(currentPlanName && plan.name === currentPlanName);
                    const isLowerTier = currentPlanTier > 0 && plan.tier < currentPlanTier;
                    const style = getPlanStyle(plan.tier, isCurrentPlan);
                    const price = billingCycle === 'monthly' ? plan.price_monthly : plan.price_yearly;
                    const period = billingCycle === 'monthly' ? t('pricing.perMonth') : t('pricing.perYear');

                    const cardClass = style.isCurrent
                      ? 'border-emerald-400 shadow-xl ring-2 ring-emerald-100 bg-emerald-50/50'
                      : style.highlight
                        ? 'border-purple-200 shadow-xl ring-1 ring-purple-100 scale-105 z-10'
                        : 'border-gray-200 hover:border-gray-300 hover:shadow-lg transition-all';

                    return (
                    <div key={plan.id} className={`relative rounded-2xl border p-8 flex flex-col ${cardClass}`}>
                        {style.isCurrent && (
                        <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-emerald-600 text-white px-4 py-1 rounded-full text-xs font-bold shadow-sm">
                            {t('pricing.currentPlan')}
                        </div>
                        )}
                        {style.highlight && !style.isCurrent && (
                        <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white px-4 py-1 rounded-full text-xs font-bold shadow-sm">
                            {t('pricing.mostPopular')}
                        </div>
                        )}
                        <div className="mb-6">
                        <h3 className={`text-lg font-bold mb-2 ${style.isCurrent ? 'text-emerald-700' : style.highlight ? 'text-purple-600' : 'text-gray-900'}`}>{plan.name}</h3>
                        <div className="flex items-baseline gap-1">
                            <span className="text-4xl font-bold text-gray-900">{getCurrencySymbol(plan.currency || 'USD')}{price}</span>
                            <span className="text-gray-500 font-medium">{period}</span>
                        </div>
                        <p className="text-sm text-gray-500 mt-4 leading-relaxed">{plan.description}</p>
                        </div>

                        <ul className="space-y-3 mb-8 flex-1">
                        {plan.features && plan.features.map((feature, i) => (
                            <li key={i} className="flex items-start gap-3 text-sm text-gray-700">
                            <Check size={18} className={`shrink-0 ${style.isCurrent ? 'text-emerald-600' : style.highlight ? 'text-purple-600' : 'text-green-600'}`} />
                            <span>{feature}</span>
                            </li>
                        ))}
                        </ul>

                        <button 
                        onClick={() => {
                            if (isCurrentPlan || isLowerTier) return;
                            const url = billingCycle === 'monthly' ? plan.checkout_url_monthly : plan.checkout_url_yearly;
                            if (url) {
                                let target = url;
                                if (userId) {
                                    const sep = target.includes('?') ? '&' : '?';
                                    target = `${target}${sep}checkout[custom][user_id]=${encodeURIComponent(userId)}`;
                                }
                                window.open(target, '_blank', 'noopener,noreferrer');
                            }
                        }}
                        disabled={isCurrentPlan || isLowerTier}
                        className={`w-full py-3 rounded-xl font-bold transition-all ${style.btn} ${(isCurrentPlan || isLowerTier) ? 'opacity-90' : ''}`}
                        >
                        {isCurrentPlan ? t('pricing.currentPlan') : isLowerTier ? t('pricing.downgrade') : t('pricing.upgrade')}
                        </button>
                    </div>
                    );
                })}
            </div>
          )}
          
          <div className="mt-12 text-center text-sm text-gray-400">
            {t('pricing.needHelp')} <a href="mailto:iterojm.app@gmail.com?subject=Pricing%20%2F%20plan%20inquiry" className="text-blue-600 hover:underline">{t('pricing.contactSalesLink')}</a>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PricingModal;
