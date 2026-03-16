import Link from "next/link";

export const metadata = {
  title: "Eagle Eyes Building Solutions LLC",
  description:
    "Eagle Eyes Building Solutions LLC is the company behind the Street Smart Buildings platform — remote monitoring, energy intelligence, and automation for commercial facilities.",
  alternates: {
    canonical: "https://streetsmartbuildings.com/company",
  },
};

export default function CompanyPage() {
  return (
    <div className="max-w-2xl mx-auto px-6 py-16">
      <h1 className="text-3xl font-bold text-gray-900 mb-6">
        Eagle Eyes Building Solutions LLC
      </h1>

      <p className="text-gray-700 leading-relaxed mb-4">
        Eagle Eyes Building Solutions LLC is the company behind the{" "}
        <Link href="/" className="text-green-700 font-semibold hover:underline">
          Street Smart Buildings
        </Link>{" "}
        platform.
      </p>

      <p className="text-gray-700 leading-relaxed mb-4">
        We develop remote monitoring, energy intelligence, and automation systems
        for commercial facilities — starting with QSR and fast casual restaurant
        operators.
      </p>

      <p className="text-gray-700 leading-relaxed">
        Our mission is to deliver the most reliable and most affordable smart
        building solutions as a systems integrator, selecting best-in-class
        hardware, software, and communication standards to reduce utility costs,
        eliminate unnecessary truck rolls, and extend equipment life.
      </p>
    </div>
  );
}
