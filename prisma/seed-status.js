const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  // All existing spots that don't have a status yet default to 'APPROVED' (from schema default)
  // Let's ensure they are active and approved
  const updated = await prisma.spot.updateMany({
    where: { isActive: true },
    data: { status: "APPROVED" },
  });
  console.log(`Set ${updated.count} active spots to APPROVED status`);

  // Inactive ones that were manually deactivated should be ARCHIVED
  const archived = await prisma.spot.updateMany({
    where: { isActive: false, status: "APPROVED" },
    data: { status: "ARCHIVED" },
  });
  console.log(`Set ${archived.count} inactive spots to ARCHIVED status`);
}

main().finally(() => prisma.$disconnect());
