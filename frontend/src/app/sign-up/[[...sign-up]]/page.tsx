import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-black">
      <SignUp
        appearance={{
          elements: {
            rootBox: "mx-auto",
            card: "bg-neutral-950 border border-white/10 shadow-2xl",
            headerTitle: "text-white",
            headerSubtitle: "text-white/50",
            socialButtonsBlockButton:
              "bg-white/5 border-white/10 text-white hover:bg-white/10",
            socialButtonsBlockButtonText: "text-white",
            formFieldLabel: "text-white/70",
            formFieldInput:
              "bg-white/5 border-white/10 text-white placeholder:text-white/30",
            formButtonPrimary:
              "bg-white text-black hover:bg-white/90 shadow-none",
            footerActionLink: "text-white/70 hover:text-white",
            dividerLine: "bg-white/10",
            dividerText: "text-white/30",
            identityPreviewText: "text-white",
            identityPreviewEditButton: "text-white/50 hover:text-white",
            formFieldAction: "text-white/50 hover:text-white",
            footer: "hidden",
          },
        }}
        forceRedirectUrl="/dashboard"
      />
    </div>
  );
}
