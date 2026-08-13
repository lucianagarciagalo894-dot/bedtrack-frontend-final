using BedTrack.Application.DTOs;
using BedTrack.Application.Interfaces;
using BedTrack.Domain.Entities;
using BedTrack.Domain.Enums;

namespace BedTrack.Application.Services;

public class HospitalService : IHospitalService
{
    private readonly IHospitalRepository _repo;

    public HospitalService(IHospitalRepository repo)
    {
        _repo = repo;
    }

    public async Task<IEnumerable<PisoDto>> GetFloorsAsync(int? sucursalId = null)
    {
        var pisos = await _repo.ObtenerPisosAsync(sucursalId);
        return pisos.Select(p => new PisoDto
        {
            Id = p.Id,
            Nombre = p.Nombre,
            Tipo = p.Tipo,
            TipoKey = p.TipoKey,
            RoomCount = p.Habitaciones.Count
        });
    }

    public async Task<IEnumerable<HabitacionDto>> GetAllRoomsAsync(int? sucursalId = null)
    {
        var habitaciones = await _repo.ObtenerHabitacionesAsync(sucursalId);
        return habitaciones.Select(MapToHabitacionDto);
    }

    public async Task<IEnumerable<HabitacionDto>> GetRoomsByFloorAsync(int floorId)
    {
        var habitaciones = await _repo.ObtenerHabitacionesPorPisoAsync(floorId);
        return habitaciones.Select(MapToHabitacionDto);
    }

    public async Task<HabitacionDto?> GetRoomByIdAsync(int roomId)
    {
        var h = await _repo.ObtenerHabitacionPorIdAsync(roomId);
        if (h == null) return null;
        return MapToHabitacionDto(h);
    }

    public async Task<CamaDto> UpdateBedStatusAsync(int bedId, UpdateBedStatusDto request)
    {
        if (request == null || string.IsNullOrWhiteSpace(request.Status))
            throw new ArgumentException("El estado es requerido");

        var cama = await _repo.ObtenerCamaPorIdAsync(bedId);
        if (cama == null) throw new KeyNotFoundException("Cama no encontrada");

        var estadoStr = request.Status.ToLower();
        var estadoAnteriorStr = cama.Estado.ToString().ToLower();

        if (estadoStr == "ocupada")
        {
            if (request.Patient == null) throw new ArgumentException("Faltan datos del paciente");
            
            if (cama.Estado == EstadoCama.Ocupada && cama.Paciente != null)
            {
                cama.Paciente.ActualizarDatos(
                    request.Patient.Nombre,
                    request.Patient.Apellido,
                    request.Patient.Edad,
                    request.Patient.Diagnostico,
                    request.Patient.DiasInternacion
                );
            }
            else
            {
                var fechaIngreso = string.IsNullOrWhiteSpace(request.Patient.FechaIngreso)
                    ? DateTime.UtcNow
                    : DateTime.TryParse(request.Patient.FechaIngreso, out var parsedDate)
                        ? parsedDate.ToUniversalTime()
                        : DateTime.UtcNow;

                var paciente = new Paciente(
                    request.Patient.Nombre,
                    request.Patient.Apellido,
                    request.Patient.Edad,
                    request.Patient.Diagnostico,
                    request.Patient.DiasInternacion,
                    fechaIngreso
                );
                
                await _repo.AgregarPacienteAsync(paciente);
                await _repo.GuardarCambiosAsync();

                cama.Ocupar(paciente.Id);
                cama.Paciente = paciente;
            }
        }
        else if (estadoStr == "enlimpieza")
        {
            if (cama.Paciente != null)
            {
                _repo.EliminarPaciente(cama.Paciente);
            }
            cama.LiberarParaLimpieza();
        }
        else if (estadoStr == "disponible")
        {
            if (cama.Estado == EstadoCama.Ocupada && cama.Paciente != null)
            {
                _repo.EliminarPaciente(cama.Paciente);
                cama.LiberarParaLimpieza();
            }
            if (cama.Estado == EstadoCama.EnLimpieza)
            {
                cama.Habilitar();
            }
        }

        var operatorName = string.IsNullOrWhiteSpace(request.OperatorName) ? "Personal de Enfermería" : request.OperatorName;
        var operatorEmail = string.IsNullOrWhiteSpace(request.OperatorEmail) ? "enfermeria@bedtrack.com" : request.OperatorEmail;
        
        var accionText = estadoStr == "ocupada"
            ? (estadoAnteriorStr == "ocupada"
                ? $"Actualizó datos de paciente {request.Patient?.Nombre} {request.Patient?.Apellido} (Diag: {request.Patient?.Diagnostico})"
                : $"Asignó paciente {request.Patient?.Nombre} {request.Patient?.Apellido} (Diag: {request.Patient?.Diagnostico})")
            : estadoStr == "enlimpieza"
                ? "Liberó la cama para desinfección y limpieza"
                : "Habilitó la cama como Disponible";

        var operatorRole = string.IsNullOrWhiteSpace(request.OperatorRole) ? "enfermeria" : request.OperatorRole;
        var sucursalId = cama.Habitacion?.Piso?.SucursalId;
        var nosocomioId = cama.Habitacion?.Piso?.Sucursal?.NosocomioId;

        var historial = new HistorialCama(
            cama.Id,
            cama.Numero,
            cama.HabitacionId,
            cama.Habitacion?.Numero ?? cama.HabitacionId,
            operatorName,
            operatorEmail,
            accionText,
            estadoAnteriorStr,
            estadoStr,
            null,
            operatorRole,
            sucursalId,
            nosocomioId
        );
        await _repo.AgregarHistorialCamaAsync(historial);

        await _repo.GuardarCambiosAsync();

        return new CamaDto
        {
            Id = cama.Id,
            Number = cama.Numero,
            Status = estadoStr,
            Patient = cama.Paciente == null ? null : new PacienteDto
            {
                Id = cama.Paciente.Id,
                Nombre = cama.Paciente.Nombre,
                Apellido = cama.Paciente.Apellido,
                Edad = cama.Paciente.Edad,
                Diagnostico = cama.Paciente.Diagnostico,
                FechaIngreso = cama.Paciente.FechaIngreso.ToString("yyyy-MM-dd"),
                DiasInternacion = cama.Paciente.DiasInternacion
            }
        };
    }

    private HabitacionDto MapToHabitacionDto(Habitacion h)
    {
        return new HabitacionDto
        {
            Id = h.Id,
            Number = h.Numero,
            FloorId = h.PisoId,
            Floor = h.Piso?.Nombre ?? "",
            Type = h.Piso?.Tipo ?? "",
            TypeKey = h.Piso?.TipoKey ?? "",
            Beds = h.Camas.Select(c => new CamaDto
            {
                Id = c.Id,
                Number = c.Numero,
                Status = c.Estado == EstadoCama.EnLimpieza ? "enlimpieza" : c.Estado.ToString().ToLower(),
                Patient = c.Paciente == null ? null : new PacienteDto
                {
                    Id = c.Paciente.Id,
                    Nombre = c.Paciente.Nombre,
                    Apellido = c.Paciente.Apellido,
                    Edad = c.Paciente.Edad,
                    Diagnostico = c.Paciente.Diagnostico,
                    FechaIngreso = c.Paciente.FechaIngreso.ToString("yyyy-MM-dd"),
                    DiasInternacion = c.Paciente.DiasInternacion
                }
            }).ToList()
        };
    }

    public async Task<IEnumerable<NosocomioDto>> GetNosocomiosAsync()
    {
        var list = (await _repo.ObtenerNosocomiosAsync()).ToList();

        return list.Select(n => new NosocomioDto
        {
            Id = n.Id,
            Nombre = n.Nombre,
            Codigo = n.Codigo,
            Direccion = n.Direccion,
            Sucursales = n.Sucursales.Select(s => new SucursalDto
            {
                Id = s.Id,
                Nombre = s.Nombre,
                Direccion = s.Direccion,
                NosocomioId = s.NosocomioId
            }).ToList()
        });
    }

    public async Task<NosocomioDto> CreateNosocomioAsync(CreateNosocomioDto dto)
    {
        if (string.IsNullOrWhiteSpace(dto.Nombre)) throw new ArgumentException("El nombre del nosocomio es requerido.");

        var codigo = string.IsNullOrWhiteSpace(dto.Codigo) ? "NOS-" + Random.Shared.Next(1000, 9999) : dto.Codigo;
        var direccion = string.IsNullOrWhiteSpace(dto.Direccion) ? "Dirección Principal" : dto.Direccion;

        var nosocomio = new Nosocomio(dto.Nombre, codigo, direccion);
        await _repo.AgregarNosocomioAsync(nosocomio);
        await _repo.GuardarCambiosAsync();

        var sucursal = new Sucursal("Establecimiento Principal", direccion, nosocomio.Id);
        await _repo.AgregarSucursalAsync(sucursal);
        await _repo.GuardarCambiosAsync();

        return new NosocomioDto
        {
            Id = nosocomio.Id,
            Nombre = nosocomio.Nombre,
            Codigo = nosocomio.Codigo,
            Direccion = nosocomio.Direccion,
            Sucursales = new List<SucursalDto>
            {
                new SucursalDto
                {
                    Id = sucursal.Id,
                    Nombre = sucursal.Nombre,
                    Direccion = sucursal.Direccion,
                    NosocomioId = sucursal.NosocomioId
                }
            }
        };
    }

    public async Task<NosocomioDto> UpdateNosocomioAsync(int id, UpdateNosocomioDto dto)
    {
        var nosocomio = await _repo.ObtenerNosocomioPorIdAsync(id);
        if (nosocomio == null) throw new KeyNotFoundException("Nosocomio no encontrado");

        nosocomio.ActualizarDatos(
            string.IsNullOrWhiteSpace(dto.Nombre) ? nosocomio.Nombre : dto.Nombre,
            string.IsNullOrWhiteSpace(dto.Codigo) ? nosocomio.Codigo : dto.Codigo,
            string.IsNullOrWhiteSpace(dto.Direccion) ? nosocomio.Direccion : dto.Direccion
        );

        await _repo.GuardarCambiosAsync();

        return new NosocomioDto
        {
            Id = nosocomio.Id,
            Nombre = nosocomio.Nombre,
            Codigo = nosocomio.Codigo,
            Direccion = nosocomio.Direccion,
            Sucursales = nosocomio.Sucursales.Select(s => new SucursalDto
            {
                Id = s.Id,
                Nombre = s.Nombre,
                Direccion = s.Direccion,
                NosocomioId = s.NosocomioId
            }).ToList()
        };
    }

    public async Task<bool> DeleteNosocomioAsync(int id)
    {
        var nosocomio = await _repo.ObtenerNosocomioPorIdAsync(id);
        if (nosocomio == null) return false;

        _repo.EliminarNosocomio(nosocomio);
        return true;
    }

    public async Task<IEnumerable<SucursalDto>> GetSucursalesAsync(int nosocomioId)
    {
        var sucursales = await _repo.ObtenerSucursalesPorNosocomioAsync(nosocomioId);
        return sucursales.Select(s => new SucursalDto
        {
            Id = s.Id,
            Nombre = s.Nombre,
            Direccion = s.Direccion,
            NosocomioId = s.NosocomioId
        });
    }

    public async Task<SucursalDto> CreateSucursalAsync(CreateSucursalDto dto)
    {
        if (string.IsNullOrWhiteSpace(dto.Nombre)) throw new ArgumentException("El nombre de la sucursal es requerido.");
        var sucursal = new Sucursal(dto.Nombre, dto.Direccion, dto.NosocomioId);
        await _repo.AgregarSucursalAsync(sucursal);
        await _repo.GuardarCambiosAsync();

        return new SucursalDto
        {
            Id = sucursal.Id,
            Nombre = sucursal.Nombre,
            Direccion = sucursal.Direccion,
            NosocomioId = sucursal.NosocomioId
        };
    }

    public async Task<SucursalDto> UpdateSucursalAsync(int id, UpdateSucursalDto dto)
    {
        var sucursal = await _repo.ObtenerSucursalPorIdAsync(id);
        if (sucursal == null) throw new KeyNotFoundException("Sucursal no encontrada");

        sucursal.ActualizarDatos(
            string.IsNullOrWhiteSpace(dto.Nombre) ? sucursal.Nombre : dto.Nombre,
            string.IsNullOrWhiteSpace(dto.Direccion) ? sucursal.Direccion : dto.Direccion
        );

        await _repo.GuardarCambiosAsync();

        return new SucursalDto
        {
            Id = sucursal.Id,
            Nombre = sucursal.Nombre,
            Direccion = sucursal.Direccion,
            NosocomioId = sucursal.NosocomioId
        };
    }

    public async Task<PisoDto> CreateFloorAsync(CreatePisoDto dto)
    {
        if (string.IsNullOrWhiteSpace(dto.Nombre)) throw new ArgumentException("El nombre del piso es requerido.");

        var piso = new Piso(dto.Nombre, dto.Tipo, dto.TipoKey, dto.SucursalId);
        await _repo.AgregarPisoAsync(piso);
        await _repo.GuardarCambiosAsync();

        return new PisoDto
        {
            Id = piso.Id,
            Nombre = piso.Nombre,
            Tipo = piso.Tipo,
            TipoKey = piso.TipoKey,
            RoomCount = 0
        };
    }

    public async Task<PisoDto> UpdateFloorAsync(int id, UpdatePisoDto dto)
    {
        var piso = await _repo.ObtenerPisoPorIdAsync(id);
        if (piso == null) throw new KeyNotFoundException("Piso no encontrado");

        piso.ActualizarDatos(
            string.IsNullOrWhiteSpace(dto.Nombre) ? piso.Nombre : dto.Nombre,
            string.IsNullOrWhiteSpace(dto.Tipo) ? piso.Tipo : dto.Tipo,
            string.IsNullOrWhiteSpace(dto.TipoKey) ? piso.TipoKey : dto.TipoKey
        );

        await _repo.GuardarCambiosAsync();

        return new PisoDto
        {
            Id = piso.Id,
            Nombre = piso.Nombre,
            Tipo = piso.Tipo,
            TipoKey = piso.TipoKey,
            RoomCount = piso.Habitaciones.Count
        };
    }

    public async Task<bool> DeleteFloorAsync(int id)
    {
        var piso = await _repo.ObtenerPisoPorIdAsync(id);
        if (piso == null) return false;

        _repo.EliminarPiso(piso);
        await _repo.GuardarCambiosAsync();
        return true;
    }

    public async Task<HabitacionDto> CreateRoomAsync(CreateHabitacionDto dto)
    {
        var piso = await _repo.ObtenerPisoPorIdAsync(dto.PisoId);
        if (piso == null) throw new KeyNotFoundException("Piso no encontrado");

        var roomNumber = dto.Numero > 0 ? dto.Numero : 1;
        var habitacion = new Habitacion(roomNumber, dto.PisoId);

        var bedsToAdd = Math.Max(1, dto.CantidadCamasInicial);
        for (int i = 1; i <= bedsToAdd; i++)
        {
            habitacion.Camas.Add(new Cama(i, habitacion.Id));
        }

        await _repo.AgregarHabitacionAsync(habitacion);
        await _repo.GuardarCambiosAsync();

        var created = await _repo.ObtenerHabitacionPorIdAsync(habitacion.Id);
        return MapToHabitacionDto(created!);
    }

    public async Task<HabitacionDto> UpdateRoomAsync(int roomId, UpdateHabitacionDto dto)
    {
        var hab = await _repo.ObtenerHabitacionPorIdAsync(roomId);
        if (hab == null) throw new KeyNotFoundException("Habitación no encontrada");

        hab.ActualizarDatos(dto.Numero, dto.PisoId);
        await _repo.GuardarCambiosAsync();

        var updated = await _repo.ObtenerHabitacionPorIdAsync(roomId);
        return MapToHabitacionDto(updated!);
    }

    public async Task<bool> DeleteRoomAsync(int roomId)
    {
        var hab = await _repo.ObtenerHabitacionPorIdAsync(roomId);
        if (hab == null) return false;

        _repo.EliminarHabitacion(hab);
        await _repo.GuardarCambiosAsync();
        return true;
    }

    public async Task<CamaDto> CreateBedAsync(CreateCamaDto dto)
    {
        var hab = await _repo.ObtenerHabitacionPorIdAsync(dto.HabitacionId);
        if (hab == null) throw new KeyNotFoundException("Habitación no encontrada");

        var bedNumber = dto.Numero > 0 ? dto.Numero : (hab.Camas.Count + 1);
        var cama = new Cama(bedNumber, dto.HabitacionId);

        if (!string.IsNullOrWhiteSpace(dto.Status))
        {
            var cleanStatus = dto.Status.Trim().ToLower();
            if (cleanStatus == "enlimpieza" || cleanStatus == "en limpieza" || cleanStatus == "limpieza")
            {
                cama.ActualizarDatos(bedNumber, dto.HabitacionId, EstadoCama.EnLimpieza);
            }
            else if (Enum.TryParse<EstadoCama>(dto.Status, true, out var parsedEstado))
            {
                cama.ActualizarDatos(bedNumber, dto.HabitacionId, parsedEstado);
            }
        }

        await _repo.AgregarCamaAsync(cama);

        var operatorName = string.IsNullOrWhiteSpace(dto.OperatorName) ? "Desarrollador / Administrador" : dto.OperatorName;
        var operatorEmail = string.IsNullOrWhiteSpace(dto.OperatorEmail) ? "dev@bedtrack.com" : dto.OperatorEmail;
        var operatorRole = string.IsNullOrWhiteSpace(dto.OperatorRole) ? "developer" : dto.OperatorRole;
        var sucursalId = hab.Piso?.SucursalId;
        var nosocomioId = hab.Piso?.Sucursal?.NosocomioId;

        var statusStr = cama.Estado == EstadoCama.EnLimpieza ? "enlimpieza" : cama.Estado.ToString().ToLower();
        if (operatorRole.ToLower().Contains("enferm"))
        {
            var historial = new HistorialCama(
                cama.Id,
                cama.Numero,
                hab.Id,
                hab.Numero,
                operatorName,
                operatorEmail,
                $"Creó la Cama #{cama.Numero} en Habitación #{hab.Numero}",
                "-",
                statusStr,
                DateTime.UtcNow,
                "enfermeria",
                sucursalId,
                nosocomioId
            );
            await _repo.AgregarHistorialCamaAsync(historial);
        }
        await _repo.GuardarCambiosAsync();

        return new CamaDto
        {
            Id = cama.Id,
            Number = cama.Numero,
            Status = statusStr,
            Patient = null
        };
    }

    public async Task<CamaDto> UpdateBedAsync(int bedId, UpdateCamaDto dto)
    {
        var cama = await _repo.ObtenerCamaPorIdAsync(bedId);
        if (cama == null) throw new KeyNotFoundException("Cama no encontrada");

        var estadoAnteriorStr = cama.Estado.ToString().ToLower();

        EstadoCama? estado = null;
        if (!string.IsNullOrWhiteSpace(dto.Status) && Enum.TryParse<EstadoCama>(dto.Status, true, out var parsedEstado))
        {
            estado = parsedEstado;
        }

        cama.ActualizarDatos(dto.Numero, dto.HabitacionId, estado);

        var operatorName = string.IsNullOrWhiteSpace(dto.OperatorName) ? "Enfermería" : dto.OperatorName;
        var operatorEmail = string.IsNullOrWhiteSpace(dto.OperatorEmail) ? "enfermeria@bedtrack.com" : dto.OperatorEmail;
        var operatorRole = string.IsNullOrWhiteSpace(dto.OperatorRole) ? "enfermeria" : dto.OperatorRole;
        var sucursalId = cama.Habitacion?.Piso?.SucursalId;
        var nosocomioId = cama.Habitacion?.Piso?.Sucursal?.NosocomioId;

        var estadoNuevoStr = cama.Estado == EstadoCama.EnLimpieza ? "enlimpieza" : cama.Estado.ToString().ToLower();

        if (operatorRole.ToLower().Contains("enferm"))
        {
            var historial = new HistorialCama(
                cama.Id,
                cama.Numero,
                cama.HabitacionId,
                cama.Habitacion?.Numero ?? cama.HabitacionId,
                operatorName,
                operatorEmail,
                $"Modificó datos/estado de la Cama #{cama.Numero}",
                estadoAnteriorStr,
                estadoNuevoStr,
                DateTime.UtcNow,
                "enfermeria",
                sucursalId,
                nosocomioId
            );
            await _repo.AgregarHistorialCamaAsync(historial);
        }
        await _repo.GuardarCambiosAsync();

        return new CamaDto
        {
            Id = cama.Id,
            Number = cama.Numero,
            Status = estadoNuevoStr,
            Patient = cama.Paciente == null ? null : new PacienteDto
            {
                Id = cama.Paciente.Id,
                Nombre = cama.Paciente.Nombre,
                Apellido = cama.Paciente.Apellido,
                Edad = cama.Paciente.Edad,
                Diagnostico = cama.Paciente.Diagnostico,
                FechaIngreso = cama.Paciente.FechaIngreso.ToString("yyyy-MM-dd"),
                DiasInternacion = cama.Paciente.DiasInternacion
            }
        };
    }

    public async Task<bool> DeleteBedAsync(int bedId)
    {
        var cama = await _repo.ObtenerCamaPorIdAsync(bedId);
        if (cama == null) return false;

        _repo.EliminarCama(cama);
        await _repo.GuardarCambiosAsync();
        return true;
    }

    public DevLoginResponseDto ValidateDevLogin(DevLoginRequestDto request)
    {
        bool isValidEmail = !string.IsNullOrWhiteSpace(request.Email) && request.Email.Trim().ToLower() == "dev@gmail.com";
        bool isValidKey = !string.IsNullOrWhiteSpace(request.DevKey) && request.DevKey == "proyectofinal";

        if (isValidEmail && isValidKey)
        {
            return new DevLoginResponseDto
            {
                Success = true,
                Message = "Acceso concedido como Desarrollador",
                Role = "superadmin",
                Token = "dev-token-" + Guid.NewGuid().ToString("N")
            };
        }

        return new DevLoginResponseDto
        {
            Success = false,
            Message = "Credenciales de desarrollador inválidas. Correo: dev@gmail.com - Clave: proyectofinal",
            Role = "",
            Token = ""
        };
    }

    public async Task<StaffLoginResponseDto> ValidateStaffLoginAsync(StaffLoginRequestDto request)
    {
        var requestedNormalizedRole = UsuarioStaff.NormalizarRol(request.Rol);
        var users = await _repo.ObtenerUsuariosStaffAsync(request.NosocomioId, request.SucursalId);
        var user = users.FirstOrDefault(u => 
            u.Email.Equals(request.Email.Trim(), StringComparison.OrdinalIgnoreCase) && 
            UsuarioStaff.NormalizarRol(u.Rol) == requestedNormalizedRole &&
            u.Activo);

        if (user == null)
        {
            return new StaffLoginResponseDto
            {
                Success = false,
                Message = "Usuario no registrado para este hospital o inactivo."
            };
        }

        if (!string.IsNullOrEmpty(user.Password) && user.Password != request.Password)
        {
            return new StaffLoginResponseDto
            {
                Success = false,
                Message = "Contraseña incorrecta."
            };
        }

        return new StaffLoginResponseDto
        {
            Success = true,
            Message = "Inicio de sesión exitoso",
            User = new UsuarioStaffDto
            {
                Id = user.Id,
                Nombre = user.Nombre,
                Email = user.Email,
                Rol = user.Rol,
                Activo = user.Activo,
                NosocomioId = user.NosocomioId,
                SucursalId = user.SucursalId,
                HospitalNombre = user.Nosocomio?.Nombre ?? "Hospital Asignado"
            },
            Token = "staff-token-" + Guid.NewGuid().ToString("N")
        };
    }

    public async Task<NosocomioDto> CreateFullHospitalSetupAsync(FullHospitalSetupDto dto)
    {
        if (string.IsNullOrWhiteSpace(dto.NombreNosocomio))
            throw new ArgumentException("El nombre del hospital/nosocomio es requerido.");

        var nosocomio = new Nosocomio(
            dto.NombreNosocomio,
            string.IsNullOrWhiteSpace(dto.CodigoNosocomio) ? "HOSP-" + Random.Shared.Next(100, 999) : dto.CodigoNosocomio,
            string.IsNullOrWhiteSpace(dto.DireccionNosocomio) ? "Dirección Principal" : dto.DireccionNosocomio
        );
        await _repo.AgregarNosocomioAsync(nosocomio);
        await _repo.GuardarCambiosAsync();

        var sucursalNombre = string.IsNullOrWhiteSpace(dto.NombreSucursal) ? "Sede Central" : dto.NombreSucursal;
        var sucursal = new Sucursal(sucursalNombre, string.IsNullOrWhiteSpace(dto.DireccionSucursal) ? nosocomio.Direccion : dto.DireccionSucursal, nosocomio.Id);
        await _repo.AgregarSucursalAsync(sucursal);
        await _repo.GuardarCambiosAsync();

        if (dto.Pisos != null && dto.Pisos.Any())
        {
            int floorIndex = 1;
            foreach (var floorConfig in dto.Pisos)
            {
                var tipoStr = string.IsNullOrWhiteSpace(floorConfig.Tipo) ? "Privada" : floorConfig.Tipo;
                var tipoKeyStr = string.IsNullOrWhiteSpace(floorConfig.TipoKey) ? tipoStr.ToLower() : floorConfig.TipoKey;

                var piso = new Piso(floorConfig.Nombre, tipoStr, tipoKeyStr, sucursal.Id);
                await _repo.AgregarPisoAsync(piso);
                await _repo.GuardarCambiosAsync();

                int roomCount = Math.Max(1, floorConfig.CantidadHabitaciones);
                int bedsPerRoom = Math.Max(1, floorConfig.CamasPorHabitacion);

                for (int r = 1; r <= roomCount; r++)
                {
                    int roomNum = (floorIndex * 100) + r;
                    var hab = new Habitacion(roomNum, piso.Id);
                    for (int b = 1; b <= bedsPerRoom; b++)
                    {
                        var cama = new Cama(b, hab.Id);
                        hab.Camas.Add(cama);
                    }
                    await _repo.AgregarHabitacionAsync(hab);
                }
                await _repo.GuardarCambiosAsync();
                floorIndex++;
            }
        }

        var createdNosocomio = await _repo.ObtenerNosocomioPorIdAsync(nosocomio.Id);
        return new NosocomioDto
        {
            Id = createdNosocomio!.Id,
            Nombre = createdNosocomio.Nombre,
            Codigo = createdNosocomio.Codigo,
            Direccion = createdNosocomio.Direccion,
            Sucursales = createdNosocomio.Sucursales.Select(s => new SucursalDto
            {
                Id = s.Id,
                Nombre = s.Nombre,
                Direccion = s.Direccion,
                NosocomioId = s.NosocomioId
            }).ToList()
        };
    }

    public async Task<IEnumerable<UsuarioStaffDto>> GetUsuariosStaffAsync(int? nosocomioId = null, int? sucursalId = null)
    {
        var usuarios = await _repo.ObtenerUsuariosStaffAsync(nosocomioId, sucursalId);
        return usuarios.Select(u => new UsuarioStaffDto
        {
            Id = u.Id,
            Nombre = u.Nombre,
            Email = u.Email,
            Rol = u.Rol,
            Activo = u.Activo,
            NosocomioId = u.NosocomioId,
            SucursalId = u.SucursalId,
            HospitalNombre = u.Nosocomio?.Nombre ?? "Todos los nosocomios"
        });
    }

    public async Task<UsuarioStaffDto> CreateUsuarioStaffAsync(CreateUsuarioStaffDto dto)
    {
        if (string.IsNullOrWhiteSpace(dto.Nombre) || string.IsNullOrWhiteSpace(dto.Email))
            throw new ArgumentException("Nombre y correo electrónico son requeridos.");

        var usuario = new UsuarioStaff(
            dto.Nombre,
            dto.Email,
            string.IsNullOrWhiteSpace(dto.Password) ? "123456" : dto.Password,
            string.IsNullOrWhiteSpace(dto.Rol) ? "enfermeria" : dto.Rol,
            dto.NosocomioId,
            dto.SucursalId
        );

        await _repo.AgregarUsuarioStaffAsync(usuario);
        await _repo.GuardarCambiosAsync();

        var created = await _repo.ObtenerUsuarioStaffPorIdAsync(usuario.Id);

        return new UsuarioStaffDto
        {
            Id = created?.Id ?? usuario.Id,
            Nombre = created?.Nombre ?? usuario.Nombre,
            Email = created?.Email ?? usuario.Email,
            Rol = created?.Rol ?? usuario.Rol,
            Activo = created?.Activo ?? usuario.Activo,
            NosocomioId = created?.NosocomioId ?? usuario.NosocomioId,
            SucursalId = created?.SucursalId ?? usuario.SucursalId,
            HospitalNombre = created?.Nosocomio?.Nombre ?? "Hospital Asignado"
        };
    }

    public async Task<UsuarioStaffDto> UpdateUsuarioStaffAsync(int id, UpdateUsuarioStaffDto dto)
    {
        var u = await _repo.ObtenerUsuarioStaffPorIdAsync(id);
        if (u == null) throw new KeyNotFoundException("Usuario no encontrado");

        u.ActualizarDatos(dto.Nombre, dto.Email, dto.Password, dto.Rol, dto.Activo, dto.NosocomioId, dto.SucursalId);
        await _repo.GuardarCambiosAsync();

        return new UsuarioStaffDto
        {
            Id = u.Id,
            Nombre = u.Nombre,
            Email = u.Email,
            Rol = u.Rol,
            Activo = u.Activo,
            NosocomioId = u.NosocomioId,
            SucursalId = u.SucursalId,
            HospitalNombre = u.Nosocomio?.Nombre ?? "Asignado"
        };
    }

    public async Task<bool> DeleteUsuarioStaffAsync(int id)
    {
        var u = await _repo.ObtenerUsuarioStaffPorIdAsync(id);
        if (u == null) return false;

        _repo.EliminarUsuarioStaff(u);
        await _repo.GuardarCambiosAsync();
        return true;
    }

    public async Task<IEnumerable<HistorialCamaDto>> GetHistorialCamasAsync(int? camaId = null, int? sucursalId = null, int? nosocomioId = null)
    {
        try
        {
            var historial = await _repo.ObtenerHistorialCamasAsync(camaId, sucursalId, nosocomioId);
            if (historial == null) return Enumerable.Empty<HistorialCamaDto>();
            return historial.Select(h => new HistorialCamaDto
            {
                Id = h.Id,
                CamaId = h.CamaId,
                CamaNumero = h.CamaNumero,
                HabitacionId = h.HabitacionId,
                HabitacionNumero = h.HabitacionNumero,
                UsuarioNombre = h.UsuarioNombre ?? "Personal Hospitalario",
                UsuarioEmail = h.UsuarioEmail ?? "staff@hospital.com",
                UsuarioRol = h.UsuarioRol ?? "enfermeria",
                Accion = h.Accion ?? "Actualización",
                EstadoAnterior = h.EstadoAnterior ?? "disponible",
                EstadoNuevo = h.EstadoNuevo ?? "disponible",
                FechaHora = h.FechaHora.ToString("dd/MM/yyyy HH:mm:ss"),
                SucursalId = h.SucursalId,
                NosocomioId = h.NosocomioId
            }).ToList();
        }
        catch
        {
            return Enumerable.Empty<HistorialCamaDto>();
        }
    }
}
