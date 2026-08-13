using BedTrack.Application.Interfaces;
using BedTrack.Domain.Entities;
using BedTrack.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace BedTrack.Infrastructure.Repositories;

public class HospitalRepository : IHospitalRepository
{
    private readonly ApplicationDbContext _context;

    public HospitalRepository(ApplicationDbContext context)
    {
        _context = context;
    }

    public async Task<IEnumerable<Nosocomio>> ObtenerNosocomiosAsync()
    {
        return await _context.Nosocomios
            .Include(n => n.Sucursales)
            .ToListAsync();
    }

    public async Task<Nosocomio?> ObtenerNosocomioPorIdAsync(int id)
    {
        return await _context.Nosocomios
            .Include(n => n.Sucursales)
            .FirstOrDefaultAsync(n => n.Id == id);
    }

    public async Task AgregarNosocomioAsync(Nosocomio nosocomio)
    {
        await _context.Nosocomios.AddAsync(nosocomio);
    }

    public void EliminarNosocomio(Nosocomio nosocomio)
    {
        var sucursales = _context.Sucursales.Where(s => s.NosocomioId == nosocomio.Id).ToList();
        var sucursalIds = sucursales.Select(s => s.Id).ToList();
        var pisos = _context.Pisos.Where(p => p.SucursalId.HasValue && sucursalIds.Contains(p.SucursalId.Value)).ToList();
        var pisoIds = pisos.Select(p => p.Id).ToList();
        var habitaciones = _context.Habitaciones.Where(h => pisoIds.Contains(h.PisoId)).ToList();
        var habitacionIds = habitaciones.Select(h => h.Id).ToList();
        var camas = _context.Camas.Where(c => habitacionIds.Contains(c.HabitacionId)).ToList();
        var camaIds = camas.Select(c => c.Id).ToList();
        var pacientes = _context.Pacientes.Where(p => p.Cama != null && camaIds.Contains(p.Cama.Id)).ToList();
        var usuarios = _context.UsuariosStaff.Where(u => u.NosocomioId == nosocomio.Id).ToList();
        var historial = camaIds.Any() ? _context.HistorialCamas.Where(h => camaIds.Contains(h.CamaId)).ToList() : new List<HistorialCama>();

        if (historial.Any()) _context.HistorialCamas.RemoveRange(historial);
        if (pacientes.Any()) _context.Pacientes.RemoveRange(pacientes);
        if (camas.Any()) _context.Camas.RemoveRange(camas);
        _context.SaveChanges();

        if (habitaciones.Any()) _context.Habitaciones.RemoveRange(habitaciones);
        if (pisos.Any()) _context.Pisos.RemoveRange(pisos);
        if (usuarios.Any()) _context.UsuariosStaff.RemoveRange(usuarios);
        if (sucursales.Any()) _context.Sucursales.RemoveRange(sucursales);

        _context.Nosocomios.Remove(nosocomio);
        _context.SaveChanges();
    }

    public async Task<IEnumerable<Sucursal>> ObtenerSucursalesPorNosocomioAsync(int nosocomioId)
    {
        return await _context.Sucursales
            .Where(s => s.NosocomioId == nosocomioId)
            .ToListAsync();
    }

    public async Task<Sucursal?> ObtenerSucursalPorIdAsync(int id)
    {
        return await _context.Sucursales
            .Include(s => s.Nosocomio)
            .FirstOrDefaultAsync(s => s.Id == id);
    }

    public async Task AgregarSucursalAsync(Sucursal sucursal)
    {
        await _context.Sucursales.AddAsync(sucursal);
    }

    public async Task AgregarHabitacionAsync(Habitacion habitacion)
    {
        await _context.Habitaciones.AddAsync(habitacion);
    }

    public void EliminarHabitacion(Habitacion habitacion)
    {
        _context.Habitaciones.Remove(habitacion);
    }

    public async Task AgregarCamaAsync(Cama cama)
    {
        await _context.Camas.AddAsync(cama);
    }

    public void EliminarCama(Cama cama)
    {
        _context.Camas.Remove(cama);
    }

    public async Task<Piso?> ObtenerPisoPorIdAsync(int floorId)
    {
        return await _context.Pisos.FirstOrDefaultAsync(p => p.Id == floorId);
    }

    public async Task AgregarPisoAsync(Piso piso)
    {
        await _context.Pisos.AddAsync(piso);
    }

    public void EliminarPiso(Piso piso)
    {
        _context.Pisos.Remove(piso);
    }

    public async Task<IEnumerable<Piso>> ObtenerPisosAsync(int? sucursalId = null)
    {
        var query = _context.Pisos.Include(p => p.Habitaciones).AsQueryable();
        if (sucursalId.HasValue)
        {
            query = query.Where(p => p.SucursalId == sucursalId.Value);
        }
        return await query.ToListAsync();
    }

    public async Task<IEnumerable<Habitacion>> ObtenerHabitacionesAsync(int? sucursalId = null)
    {
        var query = _context.Habitaciones
            .Include(h => h.Piso)
            .Include(h => h.Camas)
                .ThenInclude(c => c.Paciente)
            .AsQueryable();
        if (sucursalId.HasValue)
        {
            query = query.Where(h => h.Piso.SucursalId == sucursalId.Value);
        }
        return await query.ToListAsync();
    }

    public async Task<IEnumerable<Habitacion>> ObtenerHabitacionesPorPisoAsync(int floorId)
    {
        return await _context.Habitaciones
            .Include(h => h.Piso)
            .Include(h => h.Camas)
                .ThenInclude(c => c.Paciente)
            .Where(h => h.PisoId == floorId)
            .ToListAsync();
    }

    public async Task<Habitacion?> ObtenerHabitacionPorIdAsync(int roomId)
    {
        return await _context.Habitaciones
            .Include(h => h.Piso)
            .Include(h => h.Camas)
                .ThenInclude(c => c.Paciente)
            .FirstOrDefaultAsync(h => h.Id == roomId);
    }

    public async Task<Cama?> ObtenerCamaPorIdAsync(int bedId)
    {
        return await _context.Camas
            .Include(c => c.Paciente)
            .Include(c => c.Habitacion)
                .ThenInclude(h => h.Piso)
                    .ThenInclude(p => p.Sucursal)
            .FirstOrDefaultAsync(c => c.Id == bedId);
    }

    public async Task AgregarPacienteAsync(Paciente paciente)
    {
        await _context.Pacientes.AddAsync(paciente);
    }

    public void EliminarPaciente(Paciente paciente)
    {
        _context.Pacientes.Remove(paciente);
    }

    public async Task<IEnumerable<UsuarioStaff>> ObtenerUsuariosStaffAsync(int? nosocomioId = null, int? sucursalId = null)
    {
        var query = _context.UsuariosStaff
            .Include(u => u.Nosocomio)
            .Include(u => u.Sucursal)
            .AsQueryable();

        if (sucursalId.HasValue)
        {
            query = query.Where(u => 
                u.SucursalId == sucursalId.Value || 
                (nosocomioId.HasValue && u.NosocomioId == nosocomioId.Value) || 
                u.NosocomioId == null || 
                u.SucursalId == null);
        }
        else if (nosocomioId.HasValue)
        {
            query = query.Where(u => u.NosocomioId == nosocomioId.Value || u.NosocomioId == null);
        }

        return await query.ToListAsync();
    }

    public async Task<UsuarioStaff?> ObtenerUsuarioStaffPorIdAsync(int id)
    {
        return await _context.UsuariosStaff
            .Include(u => u.Nosocomio)
            .Include(u => u.Sucursal)
            .FirstOrDefaultAsync(u => u.Id == id);
    }

    public async Task AgregarUsuarioStaffAsync(UsuarioStaff usuario)
    {
        await _context.UsuariosStaff.AddAsync(usuario);
    }

    public void EliminarUsuarioStaff(UsuarioStaff usuario)
    {
        _context.UsuariosStaff.Remove(usuario);
    }

    public async Task<IEnumerable<HistorialCama>> ObtenerHistorialCamasAsync(int? camaId = null, int? sucursalId = null, int? nosocomioId = null)
    {
        try
        {
            var query = _context.HistorialCamas.AsQueryable();
            if (camaId.HasValue && camaId.Value > 0)
            {
                query = query.Where(h => h.CamaId == camaId.Value);
            }
            if (sucursalId.HasValue && sucursalId.Value > 0)
            {
                query = query.Where(h => h.SucursalId == sucursalId.Value || h.SucursalId == null);
            }
            if (nosocomioId.HasValue && nosocomioId.Value > 0)
            {
                query = query.Where(h => h.NosocomioId == nosocomioId.Value || h.NosocomioId == null);
            }
            query = query.Where(h => string.IsNullOrEmpty(h.UsuarioRol) || 
                                     h.UsuarioRol.ToLower() == "enfermeria" || 
                                     h.UsuarioRol.ToLower() == "enfermero" || 
                                     h.UsuarioRol.ToLower() == "enfermera");

            return await query.OrderByDescending(h => h.FechaHora).Take(200).ToListAsync();
        }
        catch
        {
            return Enumerable.Empty<HistorialCama>();
        }
    }

    public async Task AgregarHistorialCamaAsync(HistorialCama historial)
    {
        await _context.HistorialCamas.AddAsync(historial);
    }

    public async Task GuardarCambiosAsync()
    {
        await _context.SaveChangesAsync();
    }
}
