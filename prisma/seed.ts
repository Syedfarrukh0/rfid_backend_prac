// prisma/seed.ts
import prisma from "../src/utils/prisma";

async function main() {
  await prisma.device.create({
    data: { uuid: "ESP-ATT-00123", secret: "abc123xyz" },
  });
}
main();
