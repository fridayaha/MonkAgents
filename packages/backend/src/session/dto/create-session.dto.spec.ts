import { validate } from 'class-validator';
import { CreateSessionDto } from './create-session.dto';

describe('CreateSessionDto', () => {
  it('should pass validation with valid data', async () => {
    const dto = new CreateSessionDto();
    dto.workingDirectory = '/test/path';
    dto.title = 'Test Session';

    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should pass validation without optional title', async () => {
    const dto = new CreateSessionDto();
    dto.workingDirectory = '/test/path';

    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should fail validation without workingDirectory', async () => {
    const dto = new CreateSessionDto();
    dto.title = 'Test Session';

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('workingDirectory');
  });

  it('should fail validation with empty workingDirectory', async () => {
    const dto = new CreateSessionDto();
    dto.workingDirectory = '';

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });
});