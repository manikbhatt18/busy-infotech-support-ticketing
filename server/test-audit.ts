import { AuditEventType } from '@prisma/client';
import prisma from './src/lib/prisma';

async function main() {
  console.log('--- Testing AuditTimeline Trigger ---');
  
  // 1. Create a mock user
  const user = await prisma.user.create({
    data: {
      email: `test-${Date.now()}@example.com`,
      passwordHash: 'dummy',
      name: 'Test User',
      role: 'AGENT'
    }
  });
  console.log(`[OK] Created User: ${user.id}`);

  // 2. Create a mock ticket
  const ticket = await prisma.ticket.create({
    data: {
      subject: 'Trigger Test',
      description: 'Testing the trigger',
      requesterEmail: 'requester@example.com',
      priority: 'LOW',
      category: 'General',
      status: 'NEW',
      primaryAssigneeId: user.id
    }
  });
  console.log(`[OK] Created Ticket: ${ticket.id}`);

  // 3. Create an AuditTimeline record
  const audit = await prisma.auditTimeline.create({
    data: {
      ticketId: ticket.id,
      actorId: user.id,
      eventType: AuditEventType.TICKET_CREATED,
      newStatus: 'NEW'
    }
  });
  console.log(`[OK] Created AuditTimeline record: ${audit.id}`);

  // 4. Attempt to UPDATE the AuditTimeline record
  console.log('\nAttempting to UPDATE the AuditTimeline record...');
  try {
    await prisma.auditTimeline.update({
      where: { id: audit.id },
      data: { newStatus: 'OPEN' }
    });
    console.log('[FAIL] Update succeeded! The trigger did NOT work.');
  } catch (error: any) {
    console.log('[SUCCESS] Update blocked by trigger. Error received:');
    console.log(error.message);
  }

  // 5. Attempt to DELETE the AuditTimeline record
  console.log('\nAttempting to DELETE the AuditTimeline record...');
  try {
    await prisma.auditTimeline.delete({
      where: { id: audit.id }
    });
    console.log('[FAIL] Delete succeeded! The trigger did NOT work.');
  } catch (error: any) {
    console.log('[SUCCESS] Delete blocked by trigger. Error received:');
    console.log(error.message);
  }
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
