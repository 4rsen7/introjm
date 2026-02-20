import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Eye, EyeOff, Check, Smile, Meh } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { useQueryClient } from '@tanstack/react-query';
import InfoModal from '../components/common/InfoModal';

const AuthPage = ({ onLogin }) => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [isLogin, setIsLogin] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: ''
  });
  const [errors, setErrors] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [serverError, setServerError] = useState('');
  const [showConfirmEmailModal, setShowConfirmEmailModal] = useState(false);


  const validateForm = () => {
    const newErrors = {};
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!formData.email.trim()) {
      newErrors.email = t('auth.emailRequired');
    } else if (!emailRegex.test(formData.email)) {
      newErrors.email = t('auth.invalidEmail');
    }

    if (!formData.password) {
      newErrors.password = t('auth.passwordRequired');
    } else if (formData.password.length < 8) {
      newErrors.password = t('auth.passwordMinLength');
    }

    if (!isLogin) {
      if (!formData.firstName.trim()) newErrors.firstName = t('auth.firstNameRequired');
      if (!formData.lastName.trim()) newErrors.lastName = t('auth.lastNameRequired');
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setServerError('');

    if (validateForm()) {
      setIsLoading(true);
      try {
        const apiUrl = import.meta.env.VITE_API_URL;

        if (!isLogin) {
           // Use Supabase SDK directly for registration to avoid race conditions 
           // with backend triggers (duplicate key error in profiles table).
           const { data, error } = await supabase.auth.signUp({
             email: formData.email,
             password: formData.password,
             options: {
               data: {
                 full_name: `${formData.firstName} ${formData.lastName}`.trim(),
               }
             }
           });

           if (error) throw error;

           if (data.session) {
             // Explicitly upsert profile to ensure name is saved (fixes missing name issue)
             const { error: profileError } = await supabase.from('profiles').upsert({
                id: data.user.id,
                email: formData.email,
                full_name: `${formData.firstName} ${formData.lastName}`.trim()
             });
             
             if (profileError) console.error("Profile update failed:", profileError);

             // Assign Starter subscription to new user
             try {
               await fetch(`${apiUrl}/subscriptions/ensure-starter`, {
                 method: 'POST',
                 headers: { 'Authorization': `Bearer ${data.session.access_token}` }
               });
             } catch (e) { /* non-blocking */ }

             localStorage.setItem('token', data.session.access_token);
             localStorage.setItem('user', JSON.stringify(data.user));
             queryClient.removeQueries(); // Clear cache for new user
             if (onLogin) onLogin(data.user);
           } else {
             setIsLogin(true);
             setShowConfirmEmailModal(true);
           }
           return;
        }

        const endpoint = isLogin ? '/login' : '/register';
        
        const payload = {
          email: formData.email,
          password: formData.password,
          ...(!isLogin && {
            firstName: formData.firstName,
            lastName: formData.lastName
          })
        };

        const response = await fetch(`${apiUrl}${endpoint}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || data.message || 'Authentication failed');
        }

        // Login Success
        localStorage.setItem('token', data.session?.access_token);
        localStorage.setItem('user', JSON.stringify(data.user));
        queryClient.removeQueries(); // Clear cache for new user
        // Ensure workspace/journeys refetch so invited users see the inviter's workspace
        queryClient.invalidateQueries({ queryKey: ['workspace'] });
        queryClient.invalidateQueries({ queryKey: ['workspace_list'] });
        queryClient.invalidateQueries({ queryKey: ['workspace', 'limits'] });
        queryClient.invalidateQueries({ queryKey: ['profile'] });
        queryClient.invalidateQueries({ queryKey: ['journeys'] });
        queryClient.invalidateQueries({ queryKey: ['personas'] });
        queryClient.invalidateQueries({ queryKey: ['metrics'] });

        // Sync session with Supabase Client SDK
        if (data.session) {
            await supabase.auth.setSession(data.session);
        }

        if (onLogin) onLogin(data.user);

      } catch (err) {
        setServerError(err.message);
      } finally {
        setIsLoading(false);
      }
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors(prev => ({ ...prev, [name]: '' }));
  };

  return (
    <div className="flex min-h-screen bg-white font-sans">
      {/* 1. Left Side - Form */}
      <div className="w-full md:w-1/2 flex flex-col justify-center px-8 sm:px-12 lg:px-24 py-12 relative z-10 bg-white">
        {/* Logo */}
        <div className="absolute top-8 left-8 sm:left-12 lg:left-24 flex items-center gap-2">
           <div className="w-8 h-8 bg-orange-600 rounded-lg flex items-center justify-center text-white font-bold shadow-sm">I</div>
           <span className="text-xl font-bold tracking-tight text-gray-900">IteroJM</span>
        </div>

        <div className="max-w-sm w-full mx-auto mt-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <h1 className="text-3xl font-bold text-gray-900 mb-2 tracking-tight">
            {isLogin ? t('auth.welcomeBack') : t('auth.createAccount')}
          </h1>
          <p className="text-gray-500 mb-8">
            {isLogin ? t('auth.enterDetails') : t('auth.startTrial')}
          </p>

          {serverError && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-600 text-sm rounded-lg flex items-center gap-2">
              <span className="font-medium">{t('auth.errorLabel')}</span> {serverError}
            </div>
          )}

          <form className="space-y-4" onSubmit={handleSubmit}>
            {!isLogin && (
              <div className="grid grid-cols-2 gap-4 animate-in fade-in slide-in-from-top-2">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('auth.firstName')}</label>
                  <input 
                    type="text" 
                    name="firstName"
                    value={formData.firstName}
                    onChange={handleChange}
                    className={`w-full px-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all bg-gray-50 focus:bg-white ${errors.firstName ? 'border-red-500' : 'border-gray-300'}`} 
                    placeholder={t('auth.placeholderJohn')} 
                  />
                  {errors.firstName && <p className="text-red-500 text-xs mt-1">{errors.firstName}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('auth.lastName')}</label>
                  <input 
                    type="text" 
                    name="lastName"
                    value={formData.lastName}
                    onChange={handleChange}
                    className={`w-full px-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all bg-gray-50 focus:bg-white ${errors.lastName ? 'border-red-500' : 'border-gray-300'}`} 
                    placeholder={t('auth.placeholderDoe')} 
                  />
                  {errors.lastName && <p className="text-red-500 text-xs mt-1">{errors.lastName}</p>}
                </div>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('auth.email')}</label>
              <input 
                type="email" 
                name="email"
                value={formData.email}
                onChange={handleChange}
                className={`w-full px-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all bg-gray-50 focus:bg-white ${errors.email ? 'border-red-500' : 'border-gray-300'}`} 
                placeholder={t('auth.emailPlaceholder')} 
              />
              {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('auth.password')}</label>
              <div className="relative">
                <input 
                  type={showPassword ? "text" : "password"} 
                  name="password"
                  value={formData.password}
                  onChange={handleChange}
                  className={`w-full px-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all pr-10 bg-gray-50 focus:bg-white ${errors.password ? 'border-red-500' : 'border-gray-300'}`} 
                  placeholder={t('auth.passwordPlaceholder')} 
                />
                <button 
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              {errors.password && <p className="text-red-500 text-xs mt-1">{errors.password}</p>}
            </div>

            {isLogin && (
              <div className="flex items-center justify-between text-sm">
                <label className="flex items-center gap-2 cursor-pointer group">
                  <input type="checkbox" className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer" />
                  <span className="text-gray-600 group-hover:text-gray-900 transition-colors">{t('auth.rememberMe')}</span>
                </label>
                <a href="#" className="text-blue-600 hover:text-blue-700 font-medium hover:underline">{t('auth.forgotPassword')}</a>
              </div>
            )}

            <button 
              type="submit" 
              disabled={isLoading}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-lg transition-all transform active:scale-[0.98] shadow-md hover:shadow-lg mt-2 disabled:opacity-70 disabled:cursor-not-allowed flex justify-center items-center"
            >
              {isLoading ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : (isLogin ? t('auth.signIn') : t('auth.createAccountButton'))}
            </button>
          </form>

          <div className="relative my-8">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-200"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-4 bg-white text-gray-500 font-medium">{t('auth.orContinueWith')}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <button className="flex items-center justify-center gap-2 px-4 py-2.5 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors font-medium text-gray-700 text-sm shadow-sm">
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
              </svg>
              {t('auth.google')}
            </button>
            <button className="flex items-center justify-center gap-2 px-4 py-2.5 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors font-medium text-gray-700 text-sm shadow-sm">
              <svg className="w-5 h-5" viewBox="0 0 23 23">
                <path fill="#f3f3f3" d="M0 0h23v23H0z"/>
                <path fill="#f35325" d="M1 1h10v10H1z"/>
                <path fill="#81bc06" d="M12 1h10v10H12z"/>
                <path fill="#05a6f0" d="M1 12h10v10H1z"/>
                <path fill="#ffba08" d="M12 12h10v10H12z"/>
              </svg>
              {t('auth.microsoft')}
            </button>
          </div>

          <div className="mt-8 text-center text-sm">
            <span className="text-gray-500">
              {isLogin ? t('auth.dontHaveAccount') : t('auth.alreadyHaveAccount')}
            </span>
            <button 
              onClick={() => { setIsLogin(!isLogin); setErrors({}); setServerError(''); }}
              className="text-blue-600 hover:text-blue-700 font-bold hover:underline transition-colors"
            >
              {isLogin ? t('auth.signUp') : t('auth.signInLink')}
            </button>
          </div>
        </div>
      </div>

      {/* 2. Right Side - Promo */}
      <div className="hidden md:flex w-1/2 bg-[#1a1f36] relative overflow-hidden flex-col justify-between p-12 lg:p-16 text-white">
        {/* Background Pattern */}
        <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#fff_1px,transparent_1px)] [background-size:24px_24px]"></div>
        
        {/* Content */}
        <div className="relative z-10 max-w-lg mt-12">
          <h2 className="text-4xl lg:text-5xl font-bold leading-tight mb-6 tracking-tight">
            {t('auth.promoTitle')}
          </h2>
          <ul className="space-y-5 mb-12">
            {[t('auth.promoItem1'), t('auth.promoItem2'), t('auth.promoItem3'), t('auth.promoItem4')].map((item, i) => (
              <li key={i} className="flex items-center gap-3 text-lg text-gray-300">
                <div className="w-6 h-6 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-400 shrink-0 border border-blue-500/30">
                  <Check size={14} strokeWidth={3} />
                </div>
                {item}
              </li>
            ))}
          </ul>
        </div>

        {/* Hero Illustration (Journey Map Preview) */}
        <div className="relative z-10 mt-auto -mb-6 -mr-20 ml-8">
           <div className="bg-white rounded-tl-2xl rounded-br-2xl rounded-tr-lg rounded-bl-lg shadow-2xl transform rotate-[-2deg] hover:rotate-0 transition-transform duration-500 w-full max-w-xl overflow-hidden border-4 border-slate-800">
              {/* Fake Browser Header */}
              <div className="bg-slate-100 border-b border-slate-200 p-3 flex items-center gap-2">
                 <div className="flex gap-1.5">
                    <div className="w-3 h-3 rounded-full bg-red-400"></div>
                    <div className="w-3 h-3 rounded-full bg-yellow-400"></div>
                    <div className="w-3 h-3 rounded-full bg-green-400"></div>
                 </div>
                 <div className="ml-4 bg-white rounded-md px-3 py-1 text-[10px] text-slate-400 flex-1 border border-slate-200 font-mono">
                    iterojm.com/editor/onboarding-journey
                 </div>
              </div>

              {/* App Interface Mockup */}
              <div className="p-4 bg-slate-50 min-h-[300px]">
                 {/* Toolbar */}
                 <div className="flex justify-between items-center mb-6">
                    <div className="flex gap-3 items-center">
                       <div className="h-8 w-8 bg-orange-600 rounded-lg flex items-center justify-center text-white font-bold text-sm shadow-sm">I</div>
                       <div>
                          <div className="h-2.5 w-24 bg-slate-300 rounded mb-1.5"></div>
                          <div className="h-2 w-16 bg-slate-200 rounded"></div>
                       </div>
                    </div>
                    <div className="flex gap-2">
                       <div className="h-8 w-8 bg-white border border-slate-200 rounded-full shadow-sm"></div>
                       <div className="h-8 w-20 bg-blue-600 rounded-lg shadow-sm"></div>
                    </div>
                 </div>

                 {/* Lanes */}
                 <div className="space-y-4">
                    {/* Stages Lane */}
                    <div className="flex gap-4">
                       <div className="w-20 shrink-0 pt-2">
                          <div className="h-2.5 w-12 bg-slate-400 rounded"></div>
                       </div>
                       <div className="flex-1 grid grid-cols-3 gap-3">
                          <div className="bg-blue-100 h-8 rounded-md border-b-2 border-blue-200 flex items-center px-2">
                             <div className="h-1.5 w-12 bg-blue-300 rounded"></div>
                          </div>
                          <div className="bg-purple-100 h-8 rounded-md border-b-2 border-purple-200 flex items-center px-2">
                             <div className="h-1.5 w-16 bg-purple-300 rounded"></div>
                          </div>
                          <div className="bg-green-100 h-8 rounded-md border-b-2 border-green-200 flex items-center px-2">
                             <div className="h-1.5 w-10 bg-green-300 rounded"></div>
                          </div>
                       </div>
                    </div>

                    {/* User Goals Lane */}
                    <div className="flex gap-4">
                       <div className="w-20 shrink-0 pt-2">
                          <div className="h-2.5 w-16 bg-slate-400 rounded"></div>
                       </div>
                       <div className="flex-1 grid grid-cols-3 gap-3">
                          <div className="bg-white p-2.5 rounded-md shadow-sm border border-slate-200">
                             <div className="h-1.5 w-full bg-slate-200 rounded mb-1.5"></div>
                             <div className="h-1.5 w-2/3 bg-slate-100 rounded"></div>
                          </div>
                          <div className="bg-white p-2.5 rounded-md shadow-sm border border-slate-200">
                             <div className="h-1.5 w-full bg-slate-200 rounded mb-1.5"></div>
                             <div className="h-1.5 w-3/4 bg-slate-100 rounded"></div>
                          </div>
                          <div className="bg-white p-2.5 rounded-md shadow-sm border border-slate-200">
                             <div className="h-1.5 w-full bg-slate-200 rounded mb-1.5"></div>
                             <div className="h-1.5 w-1/2 bg-slate-100 rounded"></div>
                          </div>
                       </div>
                    </div>

                    {/* Emotion Lane */}
                    <div className="flex gap-4">
                       <div className="w-20 shrink-0 pt-2">
                          <div className="h-2.5 w-14 bg-slate-400 rounded"></div>
                       </div>
                       <div className="flex-1 relative h-24 bg-white rounded-lg border border-slate-200 overflow-hidden shadow-sm">
                          <div className="absolute inset-0 grid grid-cols-3 divide-x divide-slate-50">
                             <div></div>
                             <div></div>
                             <div></div>
                          </div>
                          <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="none">
                             <path d="M20,60 C60,60 80,30 140,30 S220,80 280,50" fill="none" stroke="#f97316" strokeWidth="3" strokeLinecap="round" />
                             <circle cx="140" cy="30" r="4" fill="white" stroke="#f97316" strokeWidth="2" />
                             <circle cx="280" cy="50" r="4" fill="white" stroke="#f97316" strokeWidth="2" />
                          </svg>
                          {/* Emojis */}
                          <div className="absolute top-2 left-1/2 -translate-x-1/2 bg-white p-0.5 rounded-full shadow-sm border border-slate-100">
                             <Smile size={14} className="text-green-500" />
                          </div>
                          <div className="absolute bottom-4 right-8 bg-white p-0.5 rounded-full shadow-sm border border-slate-100">
                             <Meh size={14} className="text-yellow-500" />
                          </div>
                       </div>
                    </div>
                 </div>
              </div>
           </div>
        </div>
      </div>

      <InfoModal
        isOpen={showConfirmEmailModal}
        onClose={() => setShowConfirmEmailModal(false)}
        title={t('auth.accountCreatedTitle')}
        message={t('auth.accountCreatedMessage')}
        buttonText={t('common.ok')}
      />
    </div>
  );
};

export default AuthPage;