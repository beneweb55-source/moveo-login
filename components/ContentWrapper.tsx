const ContentWrapper = ({ children }: { children: React.ReactNode }) => {
  return (
    <div className="w-full max-w-7xl mx-auto px-4 sm:px-8">
      {children}
    </div>
  );
};

export default ContentWrapper;
