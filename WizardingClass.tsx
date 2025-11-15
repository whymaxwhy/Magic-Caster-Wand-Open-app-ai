import React from 'react';

const WizardingClass: React.FC = () => {
  return (
    <div className="h-full flex flex-col items-center justify-center space-y-4 text-center">
      <h3 className="text-2xl font-bold text-indigo-400">Welcome to Wizarding Class!</h3>
      <p className="text-slate-400 max-w-md">
        This section is under construction. Soon, you'll be able to practice your spellcasting, learn new techniques, and challenge yourself with magical lessons.
      </p>
      <div className="text-5xl">🎓</div>
    </div>
  );
};

export default WizardingClass;
