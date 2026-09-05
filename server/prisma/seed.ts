import { Role, TicketStatus, TicketPriority } from '@prisma/client';
import bcrypt from 'bcrypt';
import prisma from '../src/lib/prisma';

async function main() {
  console.log('Seeding database...');

  const passwordHash = await bcrypt.hash('password123', 10);

  // 1. Create default Supervisor
  const supervisor = await prisma.user.upsert({
    where: { email: 'supervisor@example.com' },
    update: {},
    create: {
      email: 'supervisor@example.com',
      name: 'Sarah Supervisor',
      passwordHash,
      role: Role.SUPERVISOR,
    },
  });

  // 2. Create default Agent
  const agent = await prisma.user.upsert({
    where: { email: 'agent@example.com' },
    update: {},
    create: {
      email: 'agent@example.com',
      name: 'Alex Agent',
      passwordHash,
      role: Role.AGENT,
    },
  });

  console.log('Created test accounts:');
  console.log('  Supervisor: supervisor@example.com / password123');
  console.log('  Agent:      agent@example.com / password123');

  // 3. Create a sample ticket if no tickets exist
  const count = await prisma.ticket.count();
  if (count === 0) {
    const ticket = await prisma.ticket.create({
      data: {
        subject: 'Cannot login to account portal',
        description: 'Customer is reporting intermittent 500 errors when attempting to log in.',
        requesterEmail: 'customer@acme.com',
        priority: TicketPriority.HIGH,
        category: 'Authentication',
        status: TicketStatus.NEW,
        primaryAssigneeId: agent.id,
        timeline: {
          create: {
            actorId: supervisor.id,
            eventType: 'TICKET_CREATED',
            newStatus: TicketStatus.NEW,
          },
        },
      },
    });
    console.log(`Created sample ticket: ${ticket.id}`);
  }

  console.log('Database seeding finished successfully!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
